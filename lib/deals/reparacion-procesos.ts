/**
 * Plan para reparar los procesos que dejó el camino viejo (2026-09-17).
 *
 * Qué arregla, según el diagnóstico del spec
 * (`docs/superpowers/specs/2026-09-17-procesos-manuales-en-crm-design.md`):
 *  - Captaciones cuyo proceso nunca pasó a "Captada" porque se captó desde la
 *    ficha de la tasación: se vinculan.
 *  - La misma tasación captada dos veces (Hipólito Yrigoyen 1550): se conserva
 *    la ficha MÁS NUEVA (decisión del dueño) y las otras se descartan, sin borrar.
 *  - Lo que no se puede arreglar solo (nombres y teléfonos que nadie cargó,
 *    tasaciones sin proceso, direcciones repetidas) se LISTA para el equipo.
 *
 * Regla de oro: ante la duda, no toca y lo reporta como conflicto. Nunca
 * reabre un proceso descartado, nunca desvincula algo ya vinculado, nunca pisa
 * un dato que la ficha ya tiene.
 *
 * Módulo PURO: el script `scripts/reparar-procesos-manuales.ts` lee la base,
 * llama a esto y —solo con `--commit`— escribe.
 */
import { armarDatosDifusionDesdeVisita, type DatosDifusionHeredados } from '@/lib/portals/datos-visita'
import type { VisitDataSnapshot } from '@/types/visit-data.types'
import { faltantesDelProceso, normalizar } from './proceso-manual'

export interface PropiedadR {
  id: string
  appraisal_id: string | null
  created_at: string
  status: string | null
  commercial_status: string | null
  address: string | null
  expensas: number | null
  portal_data: { ml?: Record<string, unknown>; ap?: Record<string, unknown> } | null
  landing_answers: Record<string, unknown> | null
}

export interface ProcesoR {
  id: string
  appraisal_id: string | null
  property_id: string | null
  stage: string
  property_address: string | null
  assigned_to: string | null
  contactoNombre: string | null
  contactoTelefono: string | null
  visit_data: unknown
}

export interface TasacionR {
  id: string
  titulo: string | null
}

export interface Vinculo {
  dealId: string
  propertyId: string
  etapaAntes: string
  direccion: string | null
  /** Solo los campos que la ficha tiene VACÍOS y la visita trae. */
  heredar: Partial<DatosDifusionHeredados>
}

export interface Descarte {
  propertyId: string
  conservaId: string
  direccion: string | null
  motivo: string
}

export interface Conflicto {
  tipo: 'varios_procesos' | 'ya_vinculado_a_otra' | 'proceso_descartado'
  detalle: string
}

export interface PlanDeReparacion {
  vincular: Vinculo[]
  descartar: Descarte[]
  conflictos: Conflicto[]
  incompletos: { dealId: string; direccion: string | null; etapa: string; faltan: string[] }[]
  tasacionesSinProceso: { appraisalId: string; titulo: string | null }[]
  direccionesDuplicadas: { direccion: string; dealIds: string[] }[]
}

/** Un proceso cerrado no cuenta como "abierto" para detectar direcciones repetidas. */
const ETAPAS_CERRADAS = ['lost', 'comprador']

function estaActiva(p: PropiedadR): boolean {
  return p.status !== 'descartada' && p.commercial_status !== 'descartada'
}

function vacio(o: Record<string, unknown> | null | undefined): boolean {
  return !o || Object.keys(o).length === 0
}

function queHeredar(p: PropiedadR, visitData: unknown): Partial<DatosDifusionHeredados> {
  if (!visitData || typeof visitData !== 'object') return {}
  const d = armarDatosDifusionDesdeVisita(visitData as VisitDataSnapshot)
  const out: Partial<DatosDifusionHeredados> = {}
  if (p.expensas == null && d.expensas != null) out.expensas = d.expensas
  const fichaSinPortales = !p.portal_data || (vacio(p.portal_data.ml) && vacio(p.portal_data.ap))
  if (fichaSinPortales && (!vacio(d.portal_data.ml) || !vacio(d.portal_data.ap))) out.portal_data = d.portal_data
  if (vacio(p.landing_answers) && !vacio(d.landing_answers)) out.landing_answers = d.landing_answers
  return out
}

export function planificarReparacion(entrada: {
  propiedades: PropiedadR[]
  procesos: ProcesoR[]
  tasaciones: TasacionR[]
}): PlanDeReparacion {
  const plan: PlanDeReparacion = {
    vincular: [], descartar: [], conflictos: [], incompletos: [], tasacionesSinProceso: [], direccionesDuplicadas: [],
  }
  const porId = new Map(entrada.propiedades.map(p => [p.id, p]))

  // 1) Captaciones agrupadas por tasación.
  const activasPorTasacion = new Map<string, PropiedadR[]>()
  for (const p of entrada.propiedades) {
    if (!p.appraisal_id || !estaActiva(p)) continue
    const lista = activasPorTasacion.get(p.appraisal_id) ?? []
    lista.push(p)
    activasPorTasacion.set(p.appraisal_id, lista)
  }

  for (const [tasacionId, fichas] of activasPorTasacion) {
    const procesos = entrada.procesos.filter(d => d.appraisal_id === tasacionId)
    if (procesos.length === 0) continue // sale en "tasaciones sin proceso"
    if (procesos.length > 1) {
      plan.conflictos.push({
        tipo: 'varios_procesos',
        detalle: `La tasación ${tasacionId} tiene ${procesos.length} procesos (${procesos.map(d => d.id).join(', ')}): elegir a mano cuál captó.`,
      })
      continue
    }
    const deal = procesos[0]
    const direccion = fichas[0].address ?? deal.property_address

    // Ya vinculado a una ficha que sigue activa: no se desvincula nada.
    const vinculada = deal.property_id ? porId.get(deal.property_id) : undefined
    if (vinculada && estaActiva(vinculada)) {
      const otras = fichas.filter(f => f.id !== vinculada.id)
      if (otras.length > 0) {
        plan.conflictos.push({
          tipo: 'ya_vinculado_a_otra',
          detalle: `El proceso ${deal.id} (${direccion}) ya apunta a la ficha ${vinculada.id}, pero hay otra(s) activa(s) de la misma tasación: ${otras.map(o => o.id).join(', ')}.`,
        })
      }
      continue
    }

    if (deal.stage === 'lost') {
      plan.conflictos.push({
        tipo: 'proceso_descartado',
        detalle: `El proceso ${deal.id} (${direccion}) está Descartado pero su tasación tiene ficha captada (${fichas.map(f => f.id).join(', ')}). Decidir si se reabre.`,
      })
      continue
    }

    // La más nueva se queda (decisión del dueño, 2026-09-17).
    const ordenadas = [...fichas].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const conserva = ordenadas[0]
    plan.vincular.push({
      dealId: deal.id,
      propertyId: conserva.id,
      etapaAntes: deal.stage,
      direccion,
      heredar: queHeredar(conserva, deal.visit_data),
    })
    for (const vieja of ordenadas.slice(1)) {
      plan.descartar.push({
        propertyId: vieja.id,
        conservaId: conserva.id,
        direccion: vieja.address,
        motivo: `Duplicada: la misma tasación se captó dos veces. Se conserva la ficha más nueva (${conserva.id.slice(0, 8)}), decisión del dueño del 2026-09-17.`,
      })
    }
  }

  // 2) Procesos a medias.
  for (const d of entrada.procesos) {
    // Las etapas exentas las decide `faltantesDelProceso`: la misma regla que
    // usa el aviso de la ficha.
    const faltan = faltantesDelProceso({
      stage: d.stage,
      contactoNombre: d.contactoNombre,
      contactoTelefono: d.contactoTelefono,
      propertyAddress: d.property_address,
      assignedTo: d.assigned_to,
    })
    if (faltan.length > 0) plan.incompletos.push({ dealId: d.id, direccion: d.property_address, etapa: d.stage, faltan })
  }

  // 3) Tasaciones que ningún proceso referencia.
  const conProceso = new Set(entrada.procesos.map(d => d.appraisal_id).filter(Boolean))
  for (const t of entrada.tasaciones) {
    if (!conProceso.has(t.id)) plan.tasacionesSinProceso.push({ appraisalId: t.id, titulo: t.titulo })
  }

  // 4) La misma dirección con más de un proceso abierto.
  const porDireccion = new Map<string, { direccion: string; dealIds: string[] }>()
  for (const d of entrada.procesos) {
    if (ETAPAS_CERRADAS.includes(d.stage)) continue
    const clave = normalizar(d.property_address)
    // Sin número de calle no es una dirección: el embudo guarda ahí textos
    // como "Solicitud de tasación — <nombre>" o "[Importado GHL] <nombre>", y
    // compararlos listaba personas repetidas como si fueran propiedades.
    if (!clave || !/[0-9]/.test(clave)) continue
    const g = porDireccion.get(clave) ?? { direccion: d.property_address ?? '', dealIds: [] }
    g.dealIds.push(d.id)
    porDireccion.set(clave, g)
  }
  plan.direccionesDuplicadas = [...porDireccion.values()].filter(g => g.dealIds.length > 1)

  return plan
}

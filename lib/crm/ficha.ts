// Lo que devuelve `GET /api/contacts/[id]/ficha` (design.md D4), armado a partir de lo
// que la ruta leyó de la base. Puro: sin red ni reloj propio.
//
// Reglas que viven acá y no en la pantalla, porque son de PERMISOS (opción conservadora,
// confirmada por el dueño el 2026-11-25): un asesor ve en Procesos, Tasaciones agendadas y
// Archivos solo lo que está a su nombre; del proceso del que salen los Detalles, si no es
// suyo, viaja solo la etapa y solo si está abierto. Lo que no viaja no se puede ver en la
// respuesta de red, aunque la pantalla no lo dibuje.
import { CRM_STAGES, deriveCRMStage } from '@/app/(dashboard)/crm/_components/crm-stages'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { hasPermission } from '@/lib/auth/roles'
import type { Role } from '@/types/auth.types'
import {
  ETAPAS_CERRADAS,
  elegirDealActivo,
  esProcesoPropio,
  puedeCerrarProceso,
  puedeConvertirSolicitud,
  situacionProceso,
  type SituacionProceso,
} from './deal-activo'
import { MINUTOS_PARA_DESHACER, puedeDeshacerPerdido } from './deshacer-perdido'
import { masReciente, ultimoContacto, type UltimoContacto } from './ultimo-contacto'

export interface ProcesoDeFicha {
  id: string
  stage: string
  created_at: string
  assigned_to: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  origin: string | null
  property_address: string | null
  neighborhood: string | null
  property_type: string | null
  property_type_other: string | null
  rooms: number | null
  covered_area: number | null
  meta_campaign_name: string | null
  meta_adset_name: string | null
  meta_ad_name: string | null
  stage_changed_at: string | null
  lost_at: string | null
  visited_at: string | null // la visita de tasación realizada: cuenta como contacto
}

export interface DatosFicha {
  contacto: {
    id: string
    full_name: string
    phone: string | null
    email: string | null
    origin: string | null
    notes: string | null
    assigned_to: string | null
    created_by: string | null
  }
  procesos: ProcesoDeFicha[]
  tasaciones: {
    id: string
    property_title: string | null
    property_location: string | null
    created_at: string
    assigned_to: string | null
    user_id: string | null
  }[]
  propiedades: { id: string; address: string | null; neighborhood: string | null; created_at: string; assigned_to: string | null }[]
  // `occurred_at` más nuevo de las llamadas y los WhatsApp marcados NO anulados del
  // contacto, de cualquier proceso (la consulta no filtra por `deal_id`).
  ultimoIntentoEn: string | null
}

export type UltimoCambioDeEtapa = { from_stage: string | null; to_stage: string; changed_at: string }

export interface Etapa {
  clave: string
  etiqueta: string
}

export interface FichaContacto {
  persona: {
    id: string
    full_name: string
    phone: string | null
    email: string | null
    origin: string | null
    notes: string | null
    asesor: { id: string; nombre: string | null } | null
  }
  // El proceso ABIERTO más reciente (chip de la cabecera). Su etapa se ve aunque sea de otro.
  procesoActivo: { id: string; etapa: string; etiquetaEtapa: string; situacion: SituacionProceso } | null
  detalles: {
    etapa: Etapa | null
    origen: string | null
    campana: string | null
    conjunto: string | null
    anuncio: string | null
    // `mostrar: false` = el renglón no se dibuja (proceso ajeno y contacto sin asesor).
    asesor: { mostrar: boolean; id: string | null; nombre: string | null }
    direccion: string | null
    barrio: string | null
    tipoPropiedad: string | null
    ambientes: number | null
    superficie: number | null
  }
  ultimoContacto: UltimoContacto & { en: string | null }
  procesos: {
    id: string
    etapa: string
    etiquetaEtapa: string
    direccion: string | null
    creado: string
    puede_convertir: boolean
    deshacer_hasta: string | null
  }[]
  tasacionesAgendadas: {
    dealId: string
    fecha: string
    hora: string | null
    direccion: string | null
    asesor: { id: string; nombre: string | null } | null
  }[]
  archivos: {
    tasaciones: { id: string; titulo: string | null; ubicacion: string | null; creado: string }[]
    propiedades: { id: string; direccion: string | null; barrio: string | null; creado: string }[]
  }
}

const estaCerrado = (stage: string) => (ETAPAS_CERRADAS as readonly string[]).includes(stage)

/** Las mismas claves y etiquetas que el CRM (`deriveCRMStage`, `CRM_STAGES`). */
export function etapaDelCRM(p: { stage: string; scheduled_date: string | null }): Etapa {
  const clave = deriveCRMStage(p)
  return { clave, etiqueta: CRM_STAGES.find((s) => s.key === clave)?.label ?? clave }
}

/**
 * Los procesos cuyo historial hace falta leer para el "Deshacer": en `lost` y con el
 * cambio de etapa de los últimos 10 minutos. Para el resto no se lee nada.
 */
export function procesosParaLeerHistorial(procesos: ProcesoDeFicha[], ahora: Date): string[] {
  const corte = ahora.getTime() - MINUTOS_PARA_DESHACER * 60_000
  return procesos
    .filter((p) => p.stage === 'lost' && p.stage_changed_at && Date.parse(p.stage_changed_at) >= corte)
    .map((p) => p.id)
}

/** Los perfiles cuyo nombre puede viajar: asesor del contacto, de los procesos. */
export function perfilesANombrar(d: DatosFicha): string[] {
  const ids = new Set<string>()
  if (d.contacto.assigned_to) ids.add(d.contacto.assigned_to)
  for (const p of d.procesos) if (p.assigned_to) ids.add(p.assigned_to)
  return [...ids]
}

const porMasNuevo = <T extends { created_at: string }>(a: T, b: T) => Date.parse(b.created_at) - Date.parse(a.created_at)

export function armarFicha(e: {
  datos: DatosFicha
  cambiosAPerdido: Map<string, UltimoCambioDeEtapa>
  nombres: Map<string, string>
  usuario: { id: string; role: Role }
  ahora: Date
}): FichaContacto {
  const { datos, usuario, nombres, ahora } = e
  const { contacto } = datos
  const soloPropio = alcanceContactos(usuario.role) !== 'todos'
  const mio = (x: string | null) => !!usuario.id && x === usuario.id
  const conNombre = (id: string | null) => (id ? { id, nombre: nombres.get(id) ?? null } : null)

  const procesos = [...datos.procesos].sort(porMasNuevo)
  const activo = elegirDealActivo(procesos)
  // El proceso de Detalles es el mismo para todos: el activo o, si no hay, el más nuevo.
  const deDetalles = activo ?? procesos[0] ?? null
  const propio = deDetalles ? esProcesoPropio(usuario, deDetalles) : true
  const verDatos = !!deDetalles && propio
  const verEtapa = !!deDetalles && (propio || !estaCerrado(deDetalles.stage))

  const asesorContacto = conNombre(contacto.assigned_to)
  let asesor: FichaContacto['detalles']['asesor']
  if (!deDetalles || propio) {
    // El asesor del proceso gana; si no tiene, el del contacto; sin ninguno, "Sin asignar todavía".
    const a = conNombre(deDetalles?.assigned_to ?? contacto.assigned_to)
    asesor = { mostrar: true, id: a?.id ?? null, nombre: a?.nombre ?? null }
  } else {
    // Proceso ajeno: el nombre de quien lo lleva NO viaja; sin asesor del contacto, no se dibuja.
    asesor = asesorContacto ? { mostrar: true, ...asesorContacto } : { mostrar: false, id: null, nombre: null }
  }

  const tipo = verDatos && deDetalles ? (deDetalles.property_type === 'otro' ? deDetalles.property_type_other : deDetalles.property_type) : null

  const permisos = {
    puedeVerTodos: hasPermission(usuario.role, 'pipeline.view_all'),
    puedeCoordinar: hasPermission(usuario.role, 'pipeline.schedule'),
    puedeAvanzar: hasPermission(usuario.role, 'pipeline.advance'),
  }
  const listables = soloPropio ? procesos.filter((p) => mio(p.assigned_to)) : procesos

  const deshacerHasta = (p: ProcesoDeFicha): string | null => {
    if (p.stage !== 'lost') return null
    const cambio = e.cambiosAPerdido.get(p.id)
    if (!cambio) return null
    if (!puedeCerrarProceso({ id: usuario.id, role: usuario.role, puedeAvanzar: permisos.puedeAvanzar }, p)) return null
    if (!puedeDeshacerPerdido({ stage: p.stage, lost_at: p.lost_at }, cambio, ahora).ok) return null
    return new Date(Date.parse(cambio.changed_at) + MINUTOS_PARA_DESHACER * 60_000).toISOString()
  }

  const ultimoEn = masReciente([datos.ultimoIntentoEn, ...datos.procesos.map((p) => p.visited_at)])
  const etapaActiva = activo ? etapaDelCRM(activo) : null

  return {
    persona: {
      id: contacto.id,
      full_name: contacto.full_name,
      phone: contacto.phone,
      email: contacto.email,
      origin: contacto.origin,
      notes: contacto.notes,
      asesor: asesorContacto,
    },
    procesoActivo:
      activo && etapaActiva
        ? { id: activo.id, etapa: etapaActiva.clave, etiquetaEtapa: etapaActiva.etiqueta, situacion: situacionProceso(activo) }
        : null,
    detalles: {
      etapa: verEtapa && deDetalles ? etapaDelCRM(deDetalles) : null,
      origen: (verDatos ? deDetalles?.origin : null) ?? contacto.origin,
      campana: verDatos ? (deDetalles?.meta_campaign_name ?? null) : null,
      conjunto: verDatos ? (deDetalles?.meta_adset_name ?? null) : null,
      anuncio: verDatos ? (deDetalles?.meta_ad_name ?? null) : null,
      asesor,
      direccion: verDatos ? (deDetalles?.property_address ?? null) : null,
      barrio: verDatos ? (deDetalles?.neighborhood ?? null) : null,
      tipoPropiedad: tipo ?? null,
      ambientes: verDatos ? (deDetalles?.rooms ?? null) : null,
      superficie: verDatos ? (deDetalles?.covered_area ?? null) : null,
    },
    ultimoContacto: { ...ultimoContacto(ultimoEn, ahora, etapaActiva?.clave ?? null), en: ultimoEn },
    procesos: listables.map((p) => {
      const etapa = etapaDelCRM(p)
      return {
        id: p.id,
        etapa: etapa.clave,
        etiquetaEtapa: etapa.etiqueta,
        direccion: p.property_address,
        creado: p.created_at,
        puede_convertir: puedeConvertirSolicitud(
          { id: usuario.id, puedeVerTodos: permisos.puedeVerTodos, puedeCoordinar: permisos.puedeCoordinar },
          p,
        ),
        deshacer_hasta: deshacerHasta(p),
      }
    }),
    tasacionesAgendadas: listables
      .filter((p) => p.stage === 'scheduled' && !!p.scheduled_date)
      .map((p) => ({
        dealId: p.id,
        fecha: p.scheduled_date ?? '',
        hora: p.scheduled_time,
        direccion: p.property_address,
        asesor: conNombre(p.assigned_to),
      })),
    archivos: {
      tasaciones: datos.tasaciones
        .filter((t) => !soloPropio || mio(t.assigned_to) || mio(t.user_id))
        .map((t) => ({ id: t.id, titulo: t.property_title, ubicacion: t.property_location, creado: t.created_at })),
      propiedades: datos.propiedades
        .filter((p) => !soloPropio || mio(p.assigned_to))
        .map((p) => ({ id: p.id, direccion: p.address, barrio: p.neighborhood, creado: p.created_at })),
    },
  }
}

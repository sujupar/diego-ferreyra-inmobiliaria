// La línea de tiempo de la ficha (crm-linea-de-tiempo, design.md D3). Puro: arma los
// eventos del sistema a partir de las filas de cada tabla, y une y corta la lista. Las
// lecturas viven en `lib/supabase/linea-de-tiempo.ts`; acá no se toca la base.

import { VIDEO_KEYS } from '@/lib/funnel/video-keys'
import { etapaCRM, NOMBRE_ETAPA } from './etapas'
import type { ActividadDeFicha } from './tipos'

export const CLASES_EVENTO = ['registro', 'etapa', 'tarea', 'whatsapp', 'video'] as const
export type ClaseEvento = (typeof CLASES_EVENTO)[number]

export interface EventoSistema {
  /** `${clase}:${id de origen}[:creada|:completada]`: único entre fuentes y estable. */
  id: string
  clase: ClaseEvento
  titulo: string
  detalle: string | null
  autor: { id: string; nombre: string } | null
  fecha: string
  fallido?: boolean
}

/** `A` es la actividad: la fila cruda en la ruta, ya armada en la respuesta. */
type ActividadMinima = { id: string; occurred_at: string }
export type ItemLinea<A extends ActividadMinima = ActividadDeFicha> =
  | { tipo: 'actividad'; actividad: A }
  | { tipo: 'evento'; evento: EventoSistema }

export interface CursorLinea {
  fecha: string
  id: string
}

type Nombres = ReadonlyMap<string, string>

function autorDe(id: string | null | undefined, nombres: Nombres): EventoSistema['autor'] {
  if (!id) return null
  const nombre = nombres.get(id)
  // Un autor que ya no existe no se reemplaza por un nombre inventado.
  return nombre ? { id, nombre } : null
}

// ── Registro ─────────────────────────────────────────────────────────

export interface FilaRegistro {
  id: string
  funnel: string
  status: string
  deal_id: string | null
  created_at: string
}

const TITULO_REGISTRO: Record<string, string> = {
  tasacion: 'Se registró · Solicitud de tasación',
  clase: 'Se registró · Clase gratuita',
}

export function eventosDeRegistro(
  filas: readonly FilaRegistro[],
  procesos: ReadonlyMap<string, { meta_ad_name: string | null }>,
): EventoSistema[] {
  return filas
    .filter((f) => f.status === 'complete')
    .map((f) => {
      const anuncio = f.deal_id ? procesos.get(f.deal_id)?.meta_ad_name?.trim() : null
      return {
        id: `registro:${f.id}`,
        clase: 'registro' as const,
        titulo: TITULO_REGISTRO[f.funnel] ?? 'Se registró en la landing',
        detalle: anuncio ? `Anuncio de Meta · ${anuncio}` : null,
        autor: null,
        fecha: f.created_at,
      }
    })
}

// ── Etapas ───────────────────────────────────────────────────────────

/**
 * El nombre de una etapa del historial. `scheduled` se lee "Coordinada": el día de la
 * tasación en ese momento no se conoce por evento. Una etapa desconocida se muestra cruda
 * antes que esconder el cambio.
 */
export function nombreEtapaHistorial(stage: string): string {
  if (stage === 'scheduled') return NOMBRE_ETAPA.coordinada
  const etapa = etapaCRM({ stage, scheduled_date: null })
  // `etapaCRM` cae en Solicitud para lo que no conoce: acá eso sería mentir.
  if (etapa === 'solicitud' && stage !== 'request') return stage
  return NOMBRE_ETAPA[etapa]
}

export interface FilaHistorial {
  id: number | string
  deal_id: string
  from_stage: string | null
  to_stage: string
  changed_at: string
  changed_by: string | null
}

export function eventosDeEtapa(
  filas: readonly FilaHistorial[],
  procesosConRegistro: ReadonlySet<string>,
  nombres: Nombres,
): EventoSistema[] {
  const r: EventoSistema[] = []
  for (const f of filas) {
    let titulo: string
    if (f.from_stage === null) {
      // La apertura de un proceso del embudo ya figura como "Se registró".
      if (procesosConRegistro.has(f.deal_id)) continue
      titulo = `Se abrió un proceso en ${nombreEtapaHistorial(f.to_stage)}`
    } else {
      if (f.from_stage === f.to_stage) continue
      titulo = `Pasó de ${nombreEtapaHistorial(f.from_stage)} a ${nombreEtapaHistorial(f.to_stage)}`
    }
    r.push({ id: `etapa:${f.id}`, clase: 'etapa', titulo, detalle: null, autor: autorDe(f.changed_by, nombres), fecha: f.changed_at })
  }
  return r
}

// ── Tareas ───────────────────────────────────────────────────────────

export interface FilaTarea {
  id: string
  title: string
  status: string
  assigned_to: string | null
  created_at: string
  created_by?: string | null
  completed_at: string | null
  completed_by: string | null
  source_activity_id: string | null
}

/** La misma ventana que `colapsarCopiasDeCoordinacion` (cartera): copias creadas a ≤60 s. */
const VENTANA_COPIAS_MS = 60_000

export function eventosDeTareas(filas: readonly FilaTarea[], nombres: Nombres): EventoSistema[] {
  const r: EventoSistema[] = []
  // Copias: mismo título, distinto asignado, creadas a ≤60 s de la primera del racimo.
  const ordenadas = [...filas].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
  const racimos: { primera: FilaTarea; asignados: Set<string | null> }[] = []
  for (const t of ordenadas) {
    if (t.source_activity_id) continue // ya figura en la llamada que la creó
    const racimo = racimos.find(
      (x) =>
        x.primera.title === t.title &&
        !x.asignados.has(t.assigned_to) &&
        Date.parse(t.created_at) - Date.parse(x.primera.created_at) <= VENTANA_COPIAS_MS,
    )
    if (racimo) racimo.asignados.add(t.assigned_to)
    else racimos.push({ primera: t, asignados: new Set([t.assigned_to]) })
  }
  for (const { primera, asignados } of racimos) {
    const asignado = primera.assigned_to ? nombres.get(primera.assigned_to) : undefined
    r.push({
      id: `tarea:${primera.id}:creada`,
      clase: 'tarea',
      titulo: `Se creó la tarea «${primera.title}»`,
      detalle: asignados.size > 1 ? 'Para la coordinación' : asignado ? `Para ${asignado}` : null,
      autor: autorDe(primera.created_by, nombres),
      fecha: primera.created_at,
    })
  }
  for (const t of filas) {
    if (t.status !== 'completed' || !t.completed_at) continue
    r.push({
      id: `tarea:${t.id}:completada`,
      clase: 'tarea',
      titulo: `Se completó la tarea «${t.title}»`,
      detalle: null,
      autor: autorDe(t.completed_by, nombres),
      fecha: t.completed_at,
    })
  }
  return r
}

// ── WhatsApp ─────────────────────────────────────────────────────────

/**
 * El teléfono con el que se buscan los WhatsApp, o null si no se debe buscar ninguno
 * (decisión 5 del dueño): sin 10 dígitos, del equipo, o compartido con otro contacto.
 */
export function telefonoUtilizable(
  phoneNorm: string | null,
  telefonosEquipo: ReadonlySet<string>,
  compartido: boolean,
): string | null {
  if (!phoneNorm || !/^\d{10}$/.test(phoneNorm)) return null
  if (compartido || telefonosEquipo.has(phoneNorm)) return null
  return phoneNorm
}

/** Corta por palabra, con "…". Vacío o solo espacios → null. */
export function recortarTexto(texto: string | null | undefined, max: number): string | null {
  const limpio = (texto ?? '').replace(/\s+/g, ' ').trim()
  if (!limpio) return null
  if (limpio.length <= max) return limpio
  const corte = limpio.slice(0, max)
  const espacio = corte.lastIndexOf(' ')
  return `${(espacio > 0 ? corte.slice(0, espacio) : corte).trimEnd()}…`
}

export const LARGO_DETALLE_WHATSAPP = 140

/** Avisos al equipo con datos de OTROS interesados: nunca en la ficha de nadie. */
const PLANTILLAS_INTERNAS = ['consulta_portal', 'consulta_sin_enlace', 'consulta_plano']

export interface FilaWhatsapp {
  id: string
  direction: string
  status: string | null
  template_name: string | null
  body_preview: string | null
  sent_by: string | null
  ai_generated: boolean | null
  created_at: string
}

export function esWhatsappInterno(m: Pick<FilaWhatsapp, 'status' | 'template_name'>): boolean {
  if (m.status?.startsWith('agent_')) return true // nota interna del agente: no salió por Meta
  return !!m.template_name && PLANTILLAS_INTERNAS.some((p) => m.template_name!.startsWith(p))
}

export function eventosDeWhatsapp(filas: readonly FilaWhatsapp[], nombres: Nombres): EventoSistema[] {
  const r: EventoSistema[] = []
  for (const m of filas) {
    if (esWhatsappInterno(m)) continue
    let titulo: string
    let autor: EventoSistema['autor'] = null
    if (m.direction === 'in') titulo = 'Escribió por WhatsApp'
    else if (m.sent_by) {
      titulo = 'Se le envió un WhatsApp'
      autor = autorDe(m.sent_by, nombres)
    } else if (m.ai_generated) titulo = 'Le respondió el asistente por WhatsApp'
    else titulo = 'Se le envió un WhatsApp automático'
    const fallido = m.direction !== 'in' && m.status === 'failed'
    r.push({
      id: `whatsapp:${m.id}`,
      clase: 'whatsapp',
      titulo: fallido ? `${titulo} · no se pudo enviar` : titulo,
      detalle: recortarTexto(m.body_preview, LARGO_DETALLE_WHATSAPP),
      autor,
      fecha: m.created_at,
      ...(fallido ? { fallido: true } : {}),
    })
  }
  return r
}

// ── Video ────────────────────────────────────────────────────────────

export interface FilaVideo {
  id: string
  video_key: string
  max_percent: number | null
  first_at: string
  playback_started: boolean | null
}

function queVideo(clave: string): string {
  if (clave === 'clase-completa') return 'Vio la clase completa'
  const pagina = (VIDEO_KEYS as Record<string, { pagina?: string } | undefined>)[clave]?.pagina
  if (pagina === 'tasacion' || pagina === 'tasacion-neta') return 'Vio el video de la landing de tasación'
  if (pagina === 'clase') return 'Vio el video de la landing de la clase'
  return 'Vio un video de la landing'
}

export function eventosDeVideo(filas: readonly FilaVideo[]): EventoSistema[] {
  return filas
    .filter((f) => f.playback_started === true)
    .map((f) => ({
      id: `video:${f.id}`,
      clase: 'video' as const,
      titulo: `${queVideo(f.video_key)} · ${Math.max(0, Math.min(100, Math.round(f.max_percent ?? 0)))} %`,
      detalle: null,
      autor: null,
      fecha: f.first_at,
    }))
}

// ── Unir y cortar ────────────────────────────────────────────────────

export function claveItem(i: ItemLinea<ActividadMinima>): string {
  return i.tipo === 'evento' ? i.evento.id : `actividad:${i.actividad.id}`
}

export function fechaItem(i: ItemLinea<ActividadMinima>): string {
  return i.tipo === 'evento' ? i.evento.fecha : i.actividad.occurred_at
}

/** Más nuevo primero; a igual instante, la clave mayor primero (orden total y estable). */
function comparar(a: { t: number; k: string }, b: { t: number; k: string }): number {
  if (a.t !== b.t) return b.t - a.t
  return a.k < b.k ? 1 : a.k > b.k ? -1 : 0
}

/**
 * Une las listas de cada fuente y devuelve la página que sigue al cursor (lo
 * estrictamente anterior a él). Cada fuente tiene que haber traído hasta `limite + 1`
 * filas desde el cursor (con `<=`, no `<`): así un empate en el corte no se pierde.
 */
export function unirYCortar<A extends ActividadMinima>(
  listas: readonly (readonly ItemLinea<A>[])[],
  cursor: CursorLinea | null,
  limite: number,
): { items: ItemLinea<A>[]; hayMas: boolean } {
  const c = cursor ? { t: Date.parse(cursor.fecha), k: cursor.id } : null
  const vistos = new Set<string>()
  const todos: { item: ItemLinea<A>; t: number; k: string }[] = []
  for (const lista of listas) {
    for (const item of lista) {
      const k = claveItem(item)
      if (vistos.has(k)) continue
      vistos.add(k)
      const x = { item, t: Date.parse(fechaItem(item)), k }
      if (Number.isNaN(x.t)) continue
      if (c && comparar(c, x) >= 0) continue // no es posterior al cursor en el orden
      todos.push(x)
    }
  }
  todos.sort(comparar)
  return { items: todos.slice(0, limite).map((x) => x.item), hayMas: todos.length > limite }
}

/**
 * Aplica un cambio local de la pantalla (nota editada, registro anulado, registro nuevo
 * arriba) a las actividades de la línea sin tocar los eventos del sistema: las que siguen
 * quedan en su lugar (con su versión nueva), las que ya no están salen, y las nuevas van
 * primero, en el orden en que las devolvió el cambio.
 */
export function aplicarAActividades<A extends ActividadMinima>(
  items: readonly ItemLinea<A>[],
  cambio: (actividades: A[]) => A[],
): ItemLinea<A>[] {
  const antes = items.flatMap((i) => (i.tipo === 'actividad' ? [i.actividad] : []))
  const despues = cambio(antes)
  const porId = new Map(despues.map((a) => [a.id, a]))
  const habia = new Set(antes.map((a) => a.id))
  const nuevas: ItemLinea<A>[] = despues.filter((a) => !habia.has(a.id)).map((actividad) => ({ tipo: 'actividad', actividad }))
  const resto = items.flatMap((i): ItemLinea<A>[] => {
    if (i.tipo === 'evento') return [i]
    const a = porId.get(i.actividad.id)
    return a ? [{ tipo: 'actividad', actividad: a }] : []
  })
  return [...nuevas, ...resto]
}

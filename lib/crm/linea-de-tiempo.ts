// La línea de tiempo de la ficha (crm-linea-de-tiempo, design.md D3). Puro: arma los
// eventos del sistema a partir de las filas de cada tabla, y une y corta la lista. Las
// lecturas viven en `lib/supabase/linea-de-tiempo.ts`; acá no se toca la base.

import { VIDEO_KEYS, type VideoKeyDef } from '@/lib/funnel/video-keys'
import { porcentajeVisto, segundosVistos, formatoMinutos } from '@/lib/video-bienvenida/tramos'
import { haceCuanto } from './formato-fecha'
import { etapaCRM, NOMBRE_ETAPA } from './etapas'
import type { ActividadDeFicha } from './tipos'

export const CLASES_EVENTO = ['registro', 'etapa', 'tarea', 'whatsapp', 'video', 'enlace_video'] as const
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
      const crudo = f.deal_id ? procesos.get(f.deal_id)?.meta_ad_name?.trim() : null
      // Un nombre con la plantilla de Meta sin completar ("{{ad.name}}") no dice nada.
      const anuncio = crudo && !/\{\{.*\}\}/.test(crudo) ? crudo : null
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
 * El nombre de una etapa del historial. `scheduled` es "Coordinada" solo si ya tenía día;
 * sin día es "Solicitud" (la regla de siempre, `etapaCRM`). Una etapa desconocida se
 * muestra cruda antes que esconder el cambio.
 */
export function nombreEtapaHistorial(stage: string, conDia = true): string {
  if (stage === 'scheduled') return conDia ? NOMBRE_ETAPA.coordinada : NOMBRE_ETAPA.solicitud
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
  /**
   * Desde crm-linea-de-tiempo el trigger guarda `scheduled_date` (el día después del cambio)
   * y `scheduled_date_antes`. Las filas viejas no lo tienen.
   */
  metadata?: Record<string, unknown> | null
}

export interface ProcesoParaEtapas {
  created_at: string
  /** El día de la tasación hoy: para las filas viejas, la mejor pista de si `scheduled` era Coordinada. */
  scheduled_date: string | null
}

/** Una apertura cuya fecha se aleja más que esto de la creación del proceso se cargó después. */
const DESFASE_APERTURA_MS = 24 * 60 * 60 * 1000

function conDia(meta: FilaHistorial['metadata'], clave: string, proceso: ProcesoParaEtapas | undefined): boolean {
  if (meta && clave in meta) return meta[clave] != null
  return !!proceso?.scheduled_date
}

export function eventosDeEtapa(
  filas: readonly FilaHistorial[],
  procesosConRegistro: ReadonlySet<string>,
  procesos: ReadonlyMap<string, ProcesoParaEtapas>,
  nombres: Nombres,
): EventoSistema[] {
  const r: EventoSistema[] = []
  for (const f of filas) {
    const proceso = procesos.get(f.deal_id)
    const autor = autorDe(f.changed_by, nombres)
    if (f.from_stage === null) {
      // La apertura de un proceso del embudo ya figura como "Se registró".
      if (procesosConRegistro.has(f.deal_id)) continue
      // 654 aperturas son anteriores al historial y se escribieron al cargar los datos:
      // su fecha y su etapa no son las del día en que se abrió. Va la fecha real del
      // proceso y, si no coincide, sin etapa.
      const real = proceso?.created_at ?? f.changed_at
      const confiable = Math.abs(Date.parse(f.changed_at) - Date.parse(real)) <= DESFASE_APERTURA_MS
      const etapa = nombreEtapaHistorial(f.to_stage, conDia(f.metadata, 'scheduled_date', proceso))
      r.push({
        id: `etapa:${f.id}`,
        clase: 'etapa',
        titulo: confiable ? `Se abrió un proceso en ${etapa}` : 'Se abrió un proceso',
        detalle: null,
        autor: confiable ? autor : null,
        fecha: real,
      })
      continue
    }
    const desde = nombreEtapaHistorial(f.from_stage, conDia(f.metadata, 'scheduled_date_antes', proceso))
    const hasta = nombreEtapaHistorial(f.to_stage, conDia(f.metadata, 'scheduled_date', proceso))
    // `request` → `scheduled` sin día sigue siendo Solicitud: no hay nada que contar.
    if (desde === hasta) continue
    r.push({ id: `etapa:${f.id}`, clase: 'etapa', titulo: `Pasó de ${desde} a ${hasta}`, detalle: null, autor, fecha: f.changed_at })
  }
  return r
}

// ── Tareas ───────────────────────────────────────────────────────────

export interface FilaTarea {
  id: string
  type?: string
  title: string
  status: string
  deal_id?: string | null
  assigned_to: string | null
  created_at: string
  created_by?: string | null
  completed_at: string | null
  completed_by: string | null
  source_activity_id: string | null
}

/** La misma regla que `colapsarCopiasDeCoordinacion` (cartera): copias creadas a ≤60 s. */
const VENTANA_COPIAS_MS = 60_000

/**
 * `coordinacion`: los ids de quienes tienen rol de coordinación. Una copia es una tarea
 * del mismo tipo, título y proceso, asignada a OTRO coordinador, creada a ≤60 s de la
 * primera: lo que hace `createTaskForRole`. Una tarea de un asesor con el mismo título no
 * es una copia.
 */
export function eventosDeTareas(
  filas: readonly FilaTarea[],
  nombres: Nombres,
  coordinacion: ReadonlySet<string> = new Set(),
): EventoSistema[] {
  const r: EventoSistema[] = []
  const ordenadas = [...filas].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
  const racimos: { primera: FilaTarea; asignados: Set<string | null> }[] = []
  const esCoord = (t: FilaTarea) => !!t.assigned_to && coordinacion.has(t.assigned_to)
  for (const t of ordenadas) {
    if (t.source_activity_id) continue // ya figura en la llamada que la creó
    const racimo = esCoord(t)
      ? racimos.find(
          (x) =>
            esCoord(x.primera) &&
            x.primera.title === t.title &&
            (x.primera.type ?? null) === (t.type ?? null) &&
            (x.primera.deal_id ?? null) === (t.deal_id ?? null) &&
            !x.asignados.has(t.assigned_to) &&
            Date.parse(t.created_at) - Date.parse(x.primera.created_at) <= VENTANA_COPIAS_MS,
        )
      : undefined
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

/**
 * Avisos al equipo con datos de OTROS interesados: nunca en la ficha de nadie. Las
 * respuestas a una consulta (`consulta_sin_enlace`, `consulta_plano`, `consulta_v2`…) van
 * al interesado: si es un contacto, son parte de su historia. Lo que reciben los
 * teléfonos del equipo se corta antes, por teléfono.
 */
const PLANTILLAS_INTERNAS = ['consulta_portal']

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
    } else if (m.template_name) titulo = 'Se le envió un WhatsApp automático' // 79 plantillas llevan ai_generated
    else if (m.ai_generated) titulo = 'Le respondió el asistente por WhatsApp'
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
  /** Para el video de bienvenida: % y minutos salen de los tramos, no de `max_percent`. */
  duration_s?: number | null
  watched_buckets?: string | null
}

function definicion(clave: string): VideoKeyDef | undefined {
  return (VIDEO_KEYS as Record<string, VideoKeyDef | undefined>)[clave]
}

function queVideo(clave: string): string {
  const nombre = definicion(clave)?.nombreEnLinea
  if (nombre) return `Vio ${nombre}`
  if (clave === 'clase-completa') return 'Vio el video de la clase completa'
  const pagina = (VIDEO_KEYS as Record<string, { pagina?: string } | undefined>)[clave]?.pagina
  if (pagina === 'tasacion' || pagina === 'tasacion-neta') return 'Vio el video de la landing de tasación'
  if (pagina === 'clase') return 'Vio el video de la landing de la clase'
  return 'Vio un video de la landing'
}

export function eventosDeVideo(filas: readonly FilaVideo[]): EventoSistema[] {
  return filas
    .filter((f) => f.playback_started === true)
    .map((f) => {
      // Video de bienvenida (tasacion-video-bienvenida, D5): se mide por tramos vistos, porque
      // `max_percent` sube con un salto. Los videos de las landings siguen como estaban.
      const porTramos = Boolean(definicion(f.video_key)?.nombreEnLinea)
      const pct = porTramos ? porcentajeVisto(f.watched_buckets) : Math.max(0, Math.min(100, Math.round(f.max_percent ?? 0)))
      const detalle = porTramos && f.duration_s && f.watched_buckets
        ? `${formatoMinutos(segundosVistos(f.watched_buckets, f.duration_s))} de ${formatoMinutos(f.duration_s)}`
        : null
      return {
        id: `video:${f.id}`,
        clase: 'video' as const,
        titulo: `${queVideo(f.video_key)} · ${pct} %`,
        detalle,
        autor: null,
        fecha: f.first_at,
      }
    })
}

// ── Enlace del video de bienvenida ───────────────────────────────────

export interface FilaEnlaceVideo {
  codigo: string
  aperturas: number
  primera_apertura: string | null
  ultima_apertura: string | null
}

/** "Abrió el enlace del video de bienvenida": UN evento, en la primera apertura. */
export function eventoDeAperturaDeEnlace(f: FilaEnlaceVideo, ahora: Date): EventoSistema | null {
  if (f.aperturas <= 0 || !f.primera_apertura) return null
  const detalle = f.aperturas > 1 && f.ultima_apertura
    ? `${f.aperturas} veces · la última ${haceCuanto(f.ultima_apertura, ahora)}`
    : null
  return {
    id: `enlace_video:${f.codigo}`,
    clase: 'enlace_video',
    titulo: 'Abrió el enlace del video de bienvenida',
    detalle,
    autor: null,
    fecha: f.primera_apertura,
  }
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
  /** Fecha de lo más viejo leído de una fuente que vino cortada: lo anterior espera a la próxima página. */
  piso: string | null = null,
): { items: ItemLinea<A>[]; hayMas: boolean } {
  const c = cursor ? { t: Date.parse(cursor.fecha), k: cursor.id } : null
  const tPiso = piso ? Date.parse(piso) : null
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
      if (tPiso !== null && x.t < tPiso) continue
      todos.push(x)
    }
  }
  // En el milisegundo del piso puede haber filas sin leer de la fuente cortada (la base
  // ordena por microsegundo, acá por clave): si la página tiene algo más nuevo, ese
  // milisegundo entero espera a la próxima (auditoría de cierre, hallazgo 2).
  if (tPiso !== null && todos.some((x) => x.t > tPiso)) {
    for (let i = todos.length - 1; i >= 0; i--) if (todos[i].t === tPiso) todos.splice(i, 1)
  }
  todos.sort(comparar)
  // Una fuente cortada siempre tiene algo más.
  return { items: todos.slice(0, limite).map((x) => x.item), hayMas: todos.length > limite || tPiso !== null }
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

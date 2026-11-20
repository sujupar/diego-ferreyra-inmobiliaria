/**
 * Cuánto del video de cada landing vio cada persona, separando a los que se
 * registraron de los que no. Lógica PURA (sin base): el servidor baja las filas
 * y esto las cruza. Spec: docs/superpowers/specs/2026-11-20-metricas-video-registrados-design.md
 *
 * La diferencia con el panel de video que ya existía es el DENOMINADOR: allí
 * solo había fila para quien tocó play, así que "plays de cargas" daba siempre
 * 100 % y no se podía decir "los que no se registraron vieron en promedio X".
 * Acá el denominador es TODA persona que entró a la landing (una fila de
 * `heatmap_session_state`, que cada landing escribe al cargar con el mismo
 * `anon_id` que el video). Quien no tocó play cuenta con 0 %.
 */

import { VIDEO_KEYS, ordenarClavesDeVideo, videoLabel, type VideoKeyDef } from '@/lib/funnel/video-keys'
import { dia } from './personas'
import { enRango, type Rango } from './rango'

export interface SesionVideoRow {
  anon_id: string
  page: string
  contact_id: string | null
  first_at: string
}

export interface VistaVideoRow {
  anon_id: string
  video_key: string
  watch_seconds: number
  duration_s: number | null
  max_percent: number
  completed: boolean
  play_intents: number
  playback_started: boolean
  watched_buckets: string | null
  contact_id: string | null
}

export interface GrupoVideo {
  /** Personas que entraron a la landing. */
  personas: number
  /** Tocaron reproducir (aunque el navegador no lo haya dejado arrancar). */
  tocaronPlay: number
  /** El video arrancó de verdad. */
  arrancaron: number
  /** % del video visto, promedio de TODAS las personas (las que no tocaron play cuentan 0). 0–1. */
  pctPromTodos: number | null
  /** % del video visto, promedio de las que tocaron play. 0–1. */
  pctPromPlay: number | null
  /** Segundos vistos en promedio, de las que tocaron play. */
  segPromPlay: number | null
  /** Vieron el 90 % o más del video (segundos únicos, no saltando). */
  llegaronFinal: number
  /** Retención: fracción (0–1) de los que tocaron play que vio cada uno de los 100 tramos. */
  curva: number[]
  /** Cuántas personas tienen el detalle por tramo (la base de `curva`). */
  conCurva: number
}

export interface VideoCohorte {
  videoKey: string
  label: string
  pagina: string
  duracionS: number | null
  registrado: GrupoVideo
  noRegistrado: GrupoVideo
}

export interface EntradaVideoCohortes {
  sesiones: SesionVideoRow[]
  videos: VistaVideoRow[]
  /** anon_id → contacto (puente `anon_identity`). */
  identidades: Map<string, string>
  /** Contactos de prueba (`contactosDePrueba(...).ids`): no cuentan en ningún grupo. */
  pruebas: Set<string>
  rango: Rango
}

/**
 * Primer día completo con la medición nueva (latido cada 5 s + `video.played`).
 * Antes de esta fecha lo visto está SUBESTIMADO: el primer envío salía en 0 s y
 * el navegador de Instagram cerraba sin mandar el último. El panel lo avisa.
 */
export const MEDICION_CONFIABLE_DESDE = '2026-11-21'

/** Visto el 90 % o más = "llegó al final". Con segundos únicos, el que salta no llega. */
const UMBRAL_FINAL = 0.9

const DEFS = VIDEO_KEYS as Record<string, VideoKeyDef>
const clavesDePagina = (pagina: string) => Object.keys(DEFS).filter((k) => DEFS[k].pagina === pagina)
const vigente = (k: string, fecha: string) => {
  const d = DEFS[k]
  return (!d.desde || fecha >= d.desde) && (!d.hasta || fecha < d.hasta)
}

interface Acumulador {
  personas: number
  tocaronPlay: number
  arrancaron: number
  sumaPctTodos: number
  sumaPctPlay: number
  sumaSegPlay: number
  llegaronFinal: number
  tramos: number[]
  conCurva: number
}

const nuevo = (): Acumulador => ({
  personas: 0, tocaronPlay: 0, arrancaron: 0, sumaPctTodos: 0, sumaPctPlay: 0, sumaSegPlay: 0,
  llegaronFinal: 0, tramos: new Array(100).fill(0), conCurva: 0,
})

function cerrar(a: Acumulador): GrupoVideo {
  const div = (x: number, n: number) => (n > 0 ? x / n : null)
  return {
    personas: a.personas,
    tocaronPlay: a.tocaronPlay,
    arrancaron: a.arrancaron,
    pctPromTodos: div(a.sumaPctTodos, a.personas),
    pctPromPlay: div(a.sumaPctPlay, a.tocaronPlay),
    segPromPlay: a.tocaronPlay > 0 ? Math.round(a.sumaSegPlay / a.tocaronPlay) : null,
    llegaronFinal: a.llegaronFinal,
    curva: a.tramos.map((n) => (a.conCurva > 0 ? n / a.conCurva : 0)),
    conCurva: a.conCurva,
  }
}

/** % visto de una fila (0–1): segundos únicos ÷ duración, tope 100 %. */
function pctVisto(v: VistaVideoRow): number {
  const segs = Number(v.watch_seconds) || 0
  const dur = Number(v.duration_s) || 0
  if (dur > 0) return Math.min(1, segs / dur)
  // Sin duración (el video no llegó a cargar los metadatos): la profundidad es lo único que hay.
  return segs > 0 ? Math.min(1, (Number(v.max_percent) || 0) / 100) : 0
}

export function armarVideoCohortes(e: EntradaVideoCohortes): VideoCohorte[] {
  // Filas de video por persona, solo de videos que tienen página.
  const porAnon = new Map<string, VistaVideoRow[]>()
  for (const v of e.videos) {
    if (!DEFS[v.video_key]?.pagina) continue
    const l = porAnon.get(v.anon_id) ?? []
    l.push(v)
    porAnon.set(v.anon_id, l)
  }

  const acc = new Map<string, { registrado: Acumulador; noRegistrado: Acumulador; duraciones: number[] }>()

  for (const s of e.sesiones) {
    const fecha = dia(s.first_at)
    if (!fecha || !enRango(fecha, e.rango)) continue
    const claves = clavesDePagina(s.page)
    if (claves.length === 0) continue

    // Su fila de video en ESTA página (si tocó play). Si tiene más de una (el día
    // de un cambio de video), la que más miró.
    const filas = (porAnon.get(s.anon_id) ?? []).filter((v) => claves.includes(v.video_key))
    const fila = filas.sort((a, b) => (Number(b.watch_seconds) || 0) - (Number(a.watch_seconds) || 0))[0] ?? null
    // Sin fila, el video que estaba publicado el día de la visita.
    const clave = fila?.video_key ?? claves.find((k) => vigente(k, fecha))
    if (!clave) continue

    const contacto = s.contact_id ?? e.identidades.get(s.anon_id) ?? fila?.contact_id ?? null
    if (contacto && e.pruebas.has(contacto)) continue

    const g = acc.get(clave) ?? { registrado: nuevo(), noRegistrado: nuevo(), duraciones: [] }
    acc.set(clave, g)
    const a = contacto ? g.registrado : g.noRegistrado
    a.personas++
    if (!fila) continue

    const segs = Number(fila.watch_seconds) || 0
    const tocoPlay = (Number(fila.play_intents) || 0) > 0 || fila.playback_started || segs > 0
    if (!tocoPlay) continue
    const pct = pctVisto(fila)
    a.tocaronPlay++
    if (fila.playback_started || segs > 0) a.arrancaron++
    a.sumaPctTodos += pct
    a.sumaPctPlay += pct
    a.sumaSegPlay += segs
    if (pct >= UMBRAL_FINAL) a.llegaronFinal++
    if (Number(fila.duration_s) > 0) g.duraciones.push(Number(fila.duration_s))
    const bits = fila.watched_buckets
    if (bits && bits.length === 100) {
      a.conCurva++
      for (let i = 0; i < 100; i++) if (bits[i] === '1') a.tramos[i]++
    }
  }

  return ordenarClavesDeVideo([...acc.keys()]).map((k) => {
    const g = acc.get(k)!
    const durs = g.duraciones.sort((x, y) => x - y)
    return {
      videoKey: k,
      label: videoLabel(k),
      pagina: DEFS[k].pagina!,
      duracionS: durs.length ? Math.round(durs[Math.floor(durs.length / 2)]) : null,
      registrado: cerrar(g.registrado),
      noRegistrado: cerrar(g.noRegistrado),
    }
  })
}

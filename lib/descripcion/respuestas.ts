/**
 * Las cuatro preguntas del comprador ideal, el diferencial, la objeción y el
 * barrio se contestan UNA sola vez en toda la plataforma (pedido del dueño,
 * 2026-09-19): en la visita de tasación, al crear la landing o, si no se
 * contestaron en ninguno de esos lugares, en el panel de la descripción.
 *
 * Este módulo junta lo que ya se contestó y calcula lo que falta. Tres fuentes:
 *  - `properties.landing_answers`: preguntas FIJAS q1..q4, heredadas de la
 *    visita al captar o escritas por el panel de la descripción.
 *  - `deals.visit_data.landing` del proceso vinculado: las mismas fijas, para
 *    propiedades captadas antes de que existiera la herencia.
 *  - `property_landings.wizard_state`: lo contestado al crear la landing. Ahí
 *    las preguntas las inventaba la IA, así que el id NO dice el tema: se
 *    clasifica por el texto de la pregunta.
 */
import { preguntasFijasLanding } from '@/lib/landing/questions-generator'

export type TemaPregunta = 'comprador' | 'diferencial' | 'objecion' | 'barrio'
export type FuenteRespuesta = 'propiedad' | 'visita' | 'landing'

export interface RespuestaConocida {
  tema: TemaPregunta | null
  pregunta: string
  respuesta: string
  fuente: FuenteRespuesta
}

export interface PreguntaPendiente {
  id: 'q1' | 'q2' | 'q3' | 'q4'
  tema: TemaPregunta
  pregunta: string
  ayuda: string
}

/** Id fijo de cada tema: es el mismo que usan la visita y la landing. */
const TEMA_POR_ID: Record<PreguntaPendiente['id'], TemaPregunta> = {
  q1: 'comprador', q2: 'diferencial', q3: 'objecion', q4: 'barrio',
}
const IDS = Object.keys(TEMA_POR_ID) as PreguntaPendiente['id'][]

/** Una respuesta de más de esto es un pegado accidental; lo demás no aporta al prompt. */
const MAX_RESPUESTA = 1000

/**
 * El ORDEN de las reglas importa y está calibrado con las preguntas reales del
 * relevamiento (ver el test). Ej.: "¿Qué características del barrio … pueden
 * atraer a los compradores?" es del barrio aunque diga "compradores", y "¿Cuál
 * es el diferencial … en la zona?" es diferencial aunque diga "zona".
 */
const REGLAS: Array<[RegExp, TemaPregunta | null]> = [
  [/financ|rango de precio/i, null],
  [/objeci|duda|frena/i, 'objecion'],
  [/diferencial/i, 'diferencial'],
  [/barrio|entorno/i, 'barrio'],
  [/zona|ubicaci|cercan|comercio/i, 'barrio'],
  [/atractiv|destac|caracter[ií]stica/i, 'diferencial'],
  [/comprador|p[uú]blico|perfil|interesad|qui[eé]n/i, 'comprador'],
]

export function clasificarPregunta(texto: string): TemaPregunta | null {
  for (const [regla, tema] of REGLAS) if (regla.test(texto)) return tema
  return null
}

function comoObjeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_RESPUESTA) : ''
}

export function juntarRespuestas(e: {
  barrio: string | null
  landingAnswers: unknown
  visitaLanding: unknown
  wizardState: unknown
}): { conocidas: RespuestaConocida[]; pendientes: PreguntaPendiente[] } {
  const fijas = preguntasFijasLanding(e.barrio)
  const textoFijo = (id: string) => fijas.find(f => f.id === id)?.question ?? id
  const conocidas: RespuestaConocida[] = []

  const deLaPropiedad = comoObjeto(e.landingAnswers)
  const deLaVisita = comoObjeto(e.visitaLanding)
  for (const id of IDS) {
    const propia = texto(deLaPropiedad[id])
    const visita = texto(deLaVisita[id])
    // La propiedad gana: es lo último que se escribió (herencia o panel).
    if (propia) conocidas.push({ tema: TEMA_POR_ID[id], pregunta: textoFijo(id), respuesta: propia, fuente: 'propiedad' })
    else if (visita) conocidas.push({ tema: TEMA_POR_ID[id], pregunta: textoFijo(id), respuesta: visita, fuente: 'visita' })
  }

  const wizard = comoObjeto(e.wizardState)
  const preguntas = Array.isArray(wizard.questions) ? wizard.questions : []
  const respuestas = comoObjeto(wizard.answers)
  for (const q of preguntas) {
    const o = comoObjeto(q)
    const id = typeof o.id === 'string' ? o.id : ''
    const pregunta = texto(o.question)
    const respuesta = texto(respuestas[id])
    if (!pregunta || !respuesta) continue
    conocidas.push({ tema: clasificarPregunta(pregunta), pregunta, respuesta, fuente: 'landing' })
  }

  const cubiertos = new Set(conocidas.map(c => c.tema).filter((t): t is TemaPregunta => t !== null))
  const pendientes: PreguntaPendiente[] = IDS
    .filter(id => !cubiertos.has(TEMA_POR_ID[id]))
    .map(id => {
      const fija = fijas.find(f => f.id === id)
      return { id, tema: TEMA_POR_ID[id], pregunta: fija?.question ?? id, ayuda: fija?.hint ?? '' }
    })

  return { conocidas, pendientes }
}

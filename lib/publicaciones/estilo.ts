/**
 * Aprender el estilo de las descripciones de Diego desde su Instagram.
 *
 *   sin_aprender → clasificando (lotes de 50, una llamada de IA por lote)
 *                → redactando (una llamada que escribe la guía) → listo
 *
 * Mientras se vuelve a aprender, el documento anterior sigue vigente: se guarda
 * en `anterior` hasta que el nuevo llega a `listo`.
 */

export interface Ejemplo {
  caption: string
  fecha: string
}

export type EstadoEstiloListo = { etapa: 'listo'; guia: string; ejemplos: Ejemplo[]; aprendido_en: string }

export type EstadoEstilo = (
  | { etapa: 'sin_aprender' }
  | { etapa: 'clasificando'; candidatos: { id: string; caption: string; fecha: string }[]; cursor: number; elegidos: string[] }
  | { etapa: 'redactando'; ejemplos: Ejemplo[] }
  | EstadoEstiloListo
) & { anterior?: EstadoEstiloListo | null }

export const TAMANO_LOTE = 50
export const EJEMPLOS_OBJETIVO = 100
/** Cuántos reels se leen como máximo: en la cuenta, ~95 % de los posts recientes son reels y ~95 % de esos NO son avisos. */
export const MAX_REELS_A_LEER = 400
export const GUIA_MAX_EJEMPLOS = 40
export const GUIA_MAX_CARACTERES = 1000

type Clasificando = Extract<EstadoEstilo, { etapa: 'clasificando' }>
type Candidato = Clasificando['candidatos'][number]

export interface MediaInstagram {
  id: string
  caption?: string
  media_product_type?: string
  timestamp: string
}

export function candidatosDeMedia(media: MediaInstagram[]): Candidato[] {
  return media
    .filter((m) => m.media_product_type === 'REELS' && (m.caption ?? '').trim().length > 0)
    .sort((a, b) => Date.parse(b.timestamp.replace(/\+0000$/, 'Z')) - Date.parse(a.timestamp.replace(/\+0000$/, 'Z')))
    .map((m) => ({ id: m.id, caption: (m.caption as string).normalize('NFC'), fecha: m.timestamp.slice(0, 10) }))
}

export function siguienteLote(e: Clasificando): { id: string; caption: string }[] {
  return e.candidatos.slice(e.cursor, e.cursor + TAMANO_LOTE).map(({ id, caption }) => ({ id, caption }))
}

export function aplicarClasificacion(
  e: Clasificando,
  resultado: { id: string; es_diego_hablando: boolean }[],
): EstadoEstilo {
  const lote = new Set(siguienteLote(e).map((c) => c.id))
  const nuevos = resultado.filter((r) => r.es_diego_hablando && lote.has(r.id)).map((r) => r.id)
  const elegidos = [...new Set([...e.elegidos, ...nuevos])]
  const cursor = e.cursor + TAMANO_LOTE

  if (elegidos.length >= EJEMPLOS_OBJETIVO || cursor >= e.candidatos.length) {
    const marcados = new Set(elegidos)
    const ejemplos = e.candidatos
      .filter((c) => marcados.has(c.id))
      .slice(0, EJEMPLOS_OBJETIVO)
      .map(({ caption, fecha }) => ({ caption, fecha }))
    return { etapa: 'redactando', ejemplos, anterior: e.anterior ?? null }
  }
  return { ...e, cursor, elegidos }
}

export const SCHEMA_CLASIFICACION = {
  name: 'clasificacion_reels',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['resultados'],
    properties: {
      resultados: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'es_diego_hablando'],
          properties: { id: { type: 'string' }, es_diego_hablando: { type: 'boolean' } },
        },
      },
    },
  },
}

export function promptClasificacion(lote: { id: string; caption: string }[]): { system: string; user: string } {
  const system = [
    'Vas a recibir descripciones (captions) de reels de Instagram de una inmobiliaria de Buenos Aires.',
    'Hay dos tipos de reel:',
    '1) Diego, el dueño, hablando a cámara: da consejos, opina, cuenta noticias o casos, explica algo del mercado.',
    '2) Avisos de propiedades: recorridos de un departamento o casa, con dirección, ambientes, metros, precio,',
    '   o palabras como "venta", "alquiler", "reservada", "vendida", "📍".',
    'Para cada caption respondé es_diego_hablando = true SOLO si es del tipo 1. Ante la duda, false.',
    'Devolvé un resultado por cada id recibido, con el mismo id.',
  ].join('\n')
  const user = lote.map((c) => `### id: ${c.id}\n${c.caption.slice(0, 1200)}`).join('\n\n')
  return { system, user }
}

export const SCHEMA_GUIA = {
  name: 'guia_estilo',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['guia'],
    properties: { guia: { type: 'string' } },
  },
}

export function promptGuia(ejemplos: { caption: string }[]): { system: string; user: string } {
  const system = [
    'Sos editor. Te paso descripciones reales que Diego Ferreyra (dueño de una inmobiliaria en Buenos Aires) escribió',
    'para sus videos hablando a cámara. Escribí una GUÍA DE ESTILO en castellano, en texto plano con viñetas, que',
    'sirva para que otra persona escriba descripciones nuevas que suenen exactamente como él. Cubrí:',
    '- largo típico (en caracteres y en párrafos)',
    '- cómo arranca (gancho, primera línea)',
    '- tono y forma de tratar al lector',
    '- uso de emojis (cuáles, cuántos, dónde)',
    '- cómo cierra (pregunta, llamado a la acción, invitación)',
    '- hashtags: los que repite siempre y cuántos usa',
    '- qué NO hace nunca',
    'Basate SOLO en los ejemplos. Máximo 2.500 caracteres.',
  ].join('\n')
  // 40 ejemplos recortados alcanzan para describir un estilo y hacen que la llamada
  // entre en el tiempo de Netlify: con los 100 enteros (~60 mil tokens) se arriesgaba
  // a cortarse siempre, y sin guía no se puede escribir ninguna descripción.
  const user = ejemplos
    .slice(0, GUIA_MAX_EJEMPLOS)
    .map((e, i) => `--- ${i + 1} ---\n${e.caption.slice(0, GUIA_MAX_CARACTERES)}`)
    .join('\n\n')
  return { system, user }
}

/** El documento que se usa HOY para describir (el nuevo o, mientras se reaprende, el anterior). */
export function estiloVigente(e: EstadoEstilo | null | undefined): EstadoEstiloListo | null {
  if (!e) return null
  if (e.etapa === 'listo') return e
  return e.anterior?.etapa === 'listo' ? e.anterior : null
}

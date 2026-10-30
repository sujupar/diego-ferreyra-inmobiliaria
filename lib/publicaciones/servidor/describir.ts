/**
 * Descripción al estilo de Diego a partir de lo que dijo en el video.
 *
 * La IA recibe la guía de estilo (aprendida del Instagram) y hasta 30 ejemplos
 * reales; más ejemplos no mejoran el tono y alargan el request.
 */
import { openaiText } from '@/lib/social/openai'
import { ajustarDescripcion, ajustarTituloYoutube, problemasDeTexto } from '../textos'
import type { Segmento, VideoFila } from '../tipos'
import { TARDO_DEMASIADO, TECHO_IA_MS, textoPlano } from './transcribir'

const MAX_EJEMPLOS = 30

function tiempo(seg: number): string {
  const s = Math.floor(seg)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function promptDescripcion(
  segmentos: Segmento[],
  guia: string,
  ejemplos: string[],
): { system: string; user: string } {
  const muestras = ejemplos
    .slice(0, MAX_EJEMPLOS)
    .map((e, i) => `--- Ejemplo ${i + 1} ---\n${e}`)
    .join('\n\n')
  const system = [
    'Escribís las descripciones de los videos de Diego Ferreyra, dueño de una inmobiliaria en Buenos Aires.',
    'Tenés que sonar EXACTAMENTE como él: mismo largo, mismo arranque, mismos emojis, mismo cierre y mismos hashtags que usa.',
    '',
    'GUÍA DE ESTILO:',
    guia,
    '',
    'DESCRIPCIONES REALES DE DIEGO:',
    muestras,
    '',
    'REGLAS QUE NO SE NEGOCIAN:',
    '- Hablá solo de lo que Diego dice en ESTE video. No agregues datos que no dijo.',
    '- Nunca inventes precios, teléfonos, direcciones ni nombres.',
    '- Castellano rioplatense (vos).',
    '- Máximo 2.200 caracteres y 30 hashtags.',
    '- titulo_youtube: una frase gancho de hasta 90 caracteres, sin hashtags ni comillas.',
  ].join('\n')
  const user = [
    'Transcripción del video (con el segundo en que arranca cada frase):',
    segmentos.map((s) => `[${tiempo(s.inicio)}] ${s.texto}`).join('\n'),
  ].join('\n')
  return { system, user }
}

export const SCHEMA_DESCRIPCION = {
  name: 'descripcion_video',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['descripcion', 'titulo_youtube'],
    properties: {
      descripcion: { type: 'string' },
      titulo_youtube: { type: 'string' },
    },
  },
}

/** Lo que escribió la persona gana siempre sobre lo que escribe la IA. */
export function aplicarResultadoDescripcion(
  video: Pick<VideoFila, 'descripcion' | 'descripcion_editada' | 'titulo_youtube' | 'titulo_editado'>,
  ia: { descripcion: string; titulo_youtube: string },
): { descripcion: string; titulo_youtube: string } {
  // Cada campo con su marca: un título escrito a mano (o vaciado a propósito) no lo
  // pisa la IA aunque la descripción la haya escrito ella.
  return {
    descripcion: video.descripcion_editada ? video.descripcion : ia.descripcion,
    titulo_youtube: video.titulo_editado ? video.titulo_youtube : ia.titulo_youtube,
  }
}

/** Saca las frases que contienen un dato que Diego no dijo (precio, teléfono). */
export function quitarFrasesConProblemas(texto: string, problemas: string[]): string {
  const datos = problemas.map((p) => p.slice(p.indexOf(': ') + 2)).filter(Boolean)
  if (datos.length === 0) return texto
  const lineas: string[] = []
  for (const linea of texto.split('\n')) {
    if (linea.trim() === '') {
      lineas.push(linea)
      continue
    }
    const frases = linea.split(/(?<=[.!?])\s+/).filter((f) => !datos.some((d) => f.includes(d)))
    if (frases.length > 0) lineas.push(frases.join(' '))
  }
  return lineas.join('\n').trim()
}

export async function escribirDescripcion(
  segmentos: Segmento[],
  guia: string,
  ejemplos: string[],
): Promise<{ descripcion: string; titulo_youtube: string }> {
  const { system, user } = promptDescripcion(segmentos, guia, ejemplos)
  let ia: { descripcion: string; titulo_youtube: string }
  try {
    ia = await openaiText<{ descripcion: string; titulo_youtube: string }>(system, user, SCHEMA_DESCRIPCION, {
      timeoutMs: TECHO_IA_MS,
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(TARDO_DEMASIADO)
    throw e
  }
  const transcripcion = textoPlano(segmentos)
  const descripcion = quitarFrasesConProblemas(ia.descripcion, problemasDeTexto(ia.descripcion, transcripcion))
  return {
    descripcion: ajustarDescripcion(descripcion),
    titulo_youtube: ajustarTituloYoutube(ia.titulo_youtube),
  }
}

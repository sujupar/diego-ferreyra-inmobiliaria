import type { NewsScript } from './scripts-repo'
// Import estático: los textos de voz entran al bundle (generados por scripts/sync-voz-diego.sh).
import reglas from '@/lib/guion/voz/reglas'
import metodo from '@/lib/guion/voz/metodo'
import playbook from '@/lib/guion/voz/playbook'
import corpus from '@/lib/guion/voz/corpus'

const VOZ = [
  ['REGLAS DE VOZ DE DIEGO', reglas],
  ['MÉTODO DEL GUIONISTA', metodo],
  ['PLAYBOOK DE FORMATOS', playbook],
  ['CORPUS REAL DE LA VOZ DE DIEGO (transcripciones)', corpus],
] as const

// Timeout por llamada: debe ser < presupuesto de reloj de la ruta (techo real de Netlify ~26s).
export const GEMINI_TIMEOUT_MS = 18_000

function loadVoz(): string {
  return VOZ.map(([titulo, texto]) => `=== ${titulo} ===\n${texto.trim()}`).join('\n\n')
}

function buildSystemPrompt(): string {
  return `Sos el guionista de Diego Ferreyra, asesor inmobiliario argentino. Escribís guiones de video corto EN SU VOZ: voseo rioplatense, directo, "Mirá,", hablándole al propietario (el cliente es el propietario). Estructura: hook de 0-3s → puente → desarrollo → cierre con CTA. Seguí al pie de la letra las reglas, el método, el playbook de formatos y el estilo real del corpus que siguen.

${loadVoz()}

=== TAREA ===
Te paso una noticia. Escribí el guion del video de Diego sobre esa noticia, listo para grabar. Usá el formato indicado (si no hay, elegí el más adecuado del playbook). Marcá lo visual entre [corchetes]. No inventes datos que no estén en la noticia. Devolvé SOLO el guion, sin comentarios ni explicaciones.`
}

interface GeminiTextResponse {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>
}

export async function guionizarPieza(p: NewsScript): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')
  const model = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash'

  const noticia = [
    `Título: ${p.titulo}`,
    `Medio: ${p.medio}`,
    p.fecha_articulo ? `Fecha: ${p.fecha_articulo}` : null,
    `URL: ${p.url}`,
    `Resumen: ${p.resumen}`,
    `Formato: ${p.formato ?? 'a elección del guionista'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: 'user', parts: [{ text: noticia }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  )
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 300)
    throw new Error(`Gemini ${res.status}: ${errText}`)
  }
  const data = (await res.json()) as GeminiTextResponse
  const cand = data.candidates?.[0]
  const text = cand?.content?.parts?.find((x) => x.text)?.text?.trim()
  if (!text) throw new Error('Gemini devolvió un guion vacío')
  if (cand?.finishReason && cand.finishReason !== 'STOP') {
    throw new Error(`Gemini cortó el guion (finishReason=${cand.finishReason})`)
  }
  return text
}

/** Mensaje acotado y sin paths de filesystem ni API keys (lo leen usuarios autenticados). */
export function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw
    .replace(/key=[^&\s"']+/gi, 'key=***')
    .replace(/(?:[A-Za-z]:)?(?:\/[\w.@ -]+){2,}/g, '[ruta]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'error desconocido'
}

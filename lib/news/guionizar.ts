import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NewsScript } from './scripts-repo'

// Snapshot de la voz de Diego (ver scripts/sync-voz-diego.sh).
const VOZ_FILES = [
  ['REGLAS DE VOZ DE DIEGO', 'REGLAS-VOZ-DIEGO.md'],
  ['MÉTODO DEL GUIONISTA', 'METODO-GUIONISTA.md'],
  ['PLAYBOOK DE FORMATOS', 'PLAYBOOK-FORMATOS.md'],
  ['CORPUS REAL DE LA VOZ DE DIEGO (transcripciones)', 'diego-voz-corpus.txt'],
] as const

let cachedVoz: string | null = null

function loadVoz(): string {
  if (cachedVoz) return cachedVoz
  const dir = join(process.cwd(), 'lib', 'guion', 'voz')
  cachedVoz = VOZ_FILES.map(
    ([titulo, file]) => `=== ${titulo} ===\n${readFileSync(join(dir, file), 'utf8').trim()}`,
  ).join('\n\n')
  return cachedVoz
}

function buildSystemPrompt(): string {
  return `Sos el guionista de Diego Ferreyra, asesor inmobiliario argentino. Escribís guiones de video corto EN SU VOZ: voseo rioplatense, directo, "Mirá,", hablándole al propietario (el cliente es el propietario). Estructura: hook de 0-3s → puente → desarrollo → cierre con CTA. Seguí al pie de la letra las reglas, el método, el playbook de formatos y el estilo real del corpus que siguen.

${loadVoz()}

=== TAREA ===
Te paso una noticia. Escribí el guion del video de Diego sobre esa noticia, listo para grabar. Usá el formato indicado (si no hay, elegí el más adecuado del playbook). Marcá lo visual entre [corchetes]. No inventes datos que no estén en la noticia. Devolvé SOLO el guion, sin comentarios ni explicaciones.`
}

interface GeminiTextResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
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
      signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: 'user', parts: [{ text: noticia }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2000 },
      }),
    },
  )
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 300)
    throw new Error(`Gemini ${res.status}: ${errText}`)
  }
  const data = (await res.json()) as GeminiTextResponse
  const text = data.candidates?.[0]?.content?.parts?.find((x) => x.text)?.text?.trim()
  if (!text) throw new Error('Gemini devolvió un guion vacío')
  return text
}

// Cliente mínimo de Gemini (REST) para el radar. Corre local con tsx, no en Netlify.
import { readFile } from 'node:fs/promises'
import type { ParteIA } from './motor'

export type ParteGemini = { text: string } | { inlineData: { mimeType: string; data: string } }

export interface OpcionesGemini {
  system: string
  partes: ParteGemini[]
  json: true
  timeoutMs: number
  temperature?: number
  /** Si falta, GEMINI_TEXT_MODEL o gemini-2.5-flash. */
  modelo?: string
}

interface RespuestaGemini {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>
  error?: { message?: string }
}

export async function llamarGemini(opts: OpcionesGemini): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')
  const model = opts.modelo ?? process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash'

  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(opts.timeoutMs),
        // La clave va en el header: así nunca aparece en una URL de un mensaje de error.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents: [{ role: 'user', parts: opts.partes }],
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    )
  } catch (e) {
    // Sin e.cause/URL: solo el nombre del problema.
    const nombre = e instanceof Error ? e.name : 'error'
    throw new Error(`Gemini no respondió (${nombre})`)
  }

  if (!res.ok) {
    let msg = ''
    try {
      const j = (await res.json()) as RespuestaGemini
      msg = j.error?.message ?? ''
    } catch {
      /* cuerpo no JSON */
    }
    throw new Error(`Gemini ${res.status}: ${msg.slice(0, 300)}`)
  }

  const data = (await res.json()) as RespuestaGemini
  const cand = data.candidates?.[0]
  const text = cand?.content?.parts?.find((p) => p.text)?.text?.trim()
  if (!text) throw new Error('Gemini devolvió una respuesta vacía')
  if (cand?.finishReason && cand.finishReason !== 'STOP') {
    throw new Error(`Gemini cortó la respuesta (finishReason=${cand.finishReason})`)
  }
  return text
}

/** Adaptador para el motor: las imágenes van inline en base64. */
export async function pedirAGemini(opts: {
  system: string
  partes: ParteIA[]
  modelo: string
  timeoutMs: number
}): Promise<string> {
  const partes: ParteGemini[] = []
  for (const p of opts.partes) {
    if ('texto' in p) partes.push({ text: p.texto })
    else partes.push({ inlineData: { mimeType: 'image/jpeg', data: (await readFile(p.imagen)).toString('base64') } })
  }
  return llamarGemini({ system: opts.system, partes, json: true, timeoutMs: opts.timeoutMs, modelo: opts.modelo })
}

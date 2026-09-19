/**
 * Cliente mínimo de la Responses API de OpenAI (fetch plano, sin SDK — mismo
 * criterio que `lib/social/openai.ts`).
 *
 * Existe aparte de `lib/ai/chat-client.ts` porque el generador de descripciones
 * necesita dos cosas que Chat Completions no da juntas: imágenes por URL y la
 * herramienta de búsqueda web (`web_search`). Verificado el 2026-09-19 con la
 * clave de la cuenta: `gpt-4.1` leyó 22 fotos en 10 s y buscó una zona en 8 s.
 *
 * `timeoutMs` es OBLIGATORIO a propósito: todo lo que usa esto corre dentro de
 * una función de Netlify, que se corta sola y devuelve una página HTML de error
 * (ver CLAUDE.md, "nunca encadenar varias llamadas de IA"). Cortar nosotros
 * primero es lo que permite responder un error legible.
 */

export type ParteEntrada =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'imagen'; url: string; detalle?: 'low' | 'high' | 'auto' }

export interface PedidoOpenAI {
  modelo: string
  instrucciones: string
  entrada: ParteEntrada[]
  /** Salida con esquema JSON estricto (todas las propiedades requeridas). */
  esquema?: { nombre: string; schema: Record<string, unknown> }
  webSearch?: boolean
  temperatura?: number
  timeoutMs: number
}

export interface RespuestaOpenAI {
  texto: string
  uso?: { entrada: number; salida: number }
}

interface RespuestaCruda {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

export async function respuestaOpenAI(p: PedidoOpenAI): Promise<RespuestaOpenAI> {
  const clave = process.env.OPENAI_API_KEY
  if (!clave) throw new Error('OPENAI_API_KEY no está configurada')

  const body: Record<string, unknown> = {
    model: p.modelo,
    instructions: p.instrucciones,
    input: [{
      role: 'user',
      content: p.entrada.map(parte => parte.tipo === 'texto'
        ? { type: 'input_text', text: parte.texto }
        : { type: 'input_image', image_url: parte.url, detail: parte.detalle ?? 'auto' }),
    }],
  }
  if (p.webSearch) body.tools = [{ type: 'web_search' }]
  if (p.esquema) body.text = { format: { type: 'json_schema', name: p.esquema.nombre, schema: p.esquema.schema, strict: true } }
  if (p.temperatura !== undefined) body.temperature = p.temperatura

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(p.timeoutMs),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${detalle.slice(0, 300)}`)
  }
  const data = (await res.json()) as RespuestaCruda
  const texto = (data.output ?? [])
    .filter(o => o.type === 'message')
    .flatMap(o => o.content ?? [])
    .filter(c => c.type === 'output_text' && typeof c.text === 'string')
    .map(c => c.text as string)
    .join('')
  if (!texto) throw new Error('OpenAI: respuesta sin texto')
  const uso = data.usage
    ? { entrada: data.usage.input_tokens ?? 0, salida: data.usage.output_tokens ?? 0 }
    : undefined
  return { texto, uso }
}

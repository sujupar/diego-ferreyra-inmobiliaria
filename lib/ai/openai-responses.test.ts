import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { respuestaOpenAI } from './openai-responses'

const respuestaOk = {
  output: [
    { type: 'web_search_call', id: 'ws_1' },
    { type: 'message', content: [{ type: 'output_text', text: '{"a":' }, { type: 'output_text', text: '1}' }] },
  ],
  usage: { input_tokens: 120, output_tokens: 30 },
}

let llamadas: Array<{ url: string; init: RequestInit }>

beforeEach(() => {
  llamadas = []
  process.env.OPENAI_API_KEY = 'sk-test'
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    llamadas.push({ url, init })
    return new Response(JSON.stringify(respuestaOk), { status: 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

const cuerpo = () => JSON.parse(String(llamadas[0].init.body))

describe('respuestaOpenAI', () => {
  it('manda texto e imágenes como partes del mensaje del usuario', async () => {
    await respuestaOpenAI({
      modelo: 'gpt-4.1', instrucciones: 'Sos X', timeoutMs: 1000,
      entrada: [{ tipo: 'texto', texto: 'Foto 1' }, { tipo: 'imagen', url: 'https://s/f1.jpg', detalle: 'low' }],
    })
    expect(llamadas[0].url).toBe('https://api.openai.com/v1/responses')
    const b = cuerpo()
    expect(b.model).toBe('gpt-4.1')
    expect(b.instructions).toBe('Sos X')
    expect(b.input).toEqual([{ role: 'user', content: [
      { type: 'input_text', text: 'Foto 1' },
      { type: 'input_image', image_url: 'https://s/f1.jpg', detail: 'low' },
    ] }])
    expect(b.tools).toBeUndefined()
    expect(b.text).toBeUndefined()
  })

  it('agrega la búsqueda web solo si se pide', async () => {
    await respuestaOpenAI({ modelo: 'm', instrucciones: 'i', timeoutMs: 1000, entrada: [{ tipo: 'texto', texto: 't' }], webSearch: true })
    expect(cuerpo().tools).toEqual([{ type: 'web_search' }])
  })

  it('pide salida con esquema JSON estricto', async () => {
    const schema = { type: 'object', properties: {}, required: [], additionalProperties: false }
    await respuestaOpenAI({ modelo: 'm', instrucciones: 'i', timeoutMs: 1000, entrada: [{ tipo: 'texto', texto: 't' }], esquema: { nombre: 'x', schema } })
    expect(cuerpo().text).toEqual({ format: { type: 'json_schema', name: 'x', schema, strict: true } })
  })

  it('junta el texto de los mensajes e informa el uso', async () => {
    const r = await respuestaOpenAI({ modelo: 'm', instrucciones: 'i', timeoutMs: 1000, entrada: [{ tipo: 'texto', texto: 't' }] })
    expect(r).toEqual({ texto: '{"a":1}', uso: { entrada: 120, salida: 30 } })
  })

  it('manda la clave en el encabezado', async () => {
    await respuestaOpenAI({ modelo: 'm', instrucciones: 'i', timeoutMs: 1000, entrada: [{ tipo: 'texto', texto: 't' }] })
    expect((llamadas[0].init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
  })

  it('lanza con el status si la API responde error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad"}}', { status: 400 })))
    await expect(respuestaOpenAI({ modelo: 'm', instrucciones: 'i', timeoutMs: 1000, entrada: [{ tipo: 'texto', texto: 't' }] }))
      .rejects.toThrow(/OpenAI 400/)
  })

  it('lanza si la respuesta no trae texto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"output":[]}', { status: 200 })))
    await expect(respuestaOpenAI({ modelo: 'm', instrucciones: 'i', timeoutMs: 1000, entrada: [{ tipo: 'texto', texto: 't' }] }))
      .rejects.toThrow(/sin texto/)
  })

  it('lanza un error claro sin clave', async () => {
    delete process.env.OPENAI_API_KEY
    await expect(respuestaOpenAI({ modelo: 'm', instrucciones: 'i', timeoutMs: 1000, entrada: [{ tipo: 'texto', texto: 't' }] }))
      .rejects.toThrow(/OPENAI_API_KEY/)
  })
})

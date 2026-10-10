import { describe, it, expect } from 'vitest'
import { pedirRespuestaMultimodal, type EntradaMultimodal } from './chat-multimodal'

const entrada = (extra: Partial<EntradaMultimodal> = {}): EntradaMultimodal => ({
    system: 'sos el asistente',
    historial: [{ role: 'user', texto: 'hola' }, { role: 'assistant', texto: '{"bloques":[]}' }],
    mensaje: 'mirá esta captura',
    adjuntos: [
        { tipo: 'imagen', nombre: 'captura.png', mime: 'image/png', base64: 'AAA' },
        { tipo: 'pdf', nombre: 'otra.pdf', mime: 'application/pdf', base64: 'BBB' },
    ],
    apiKey: 'k', modelo: 'gpt-4.1', timeoutMs: 1000,
    ...extra,
})

interface CuerpoEnviado {
    model: string
    response_format: unknown
    messages: { role: string; content: unknown }[]
}

function fetchFalso(respuesta: { status: number; body: unknown }, capturar?: (body: CuerpoEnviado) => void): typeof fetch {
    return (async (_url: string, init: RequestInit) => {
        capturar?.(JSON.parse(String(init.body)) as CuerpoEnviado)
        return new Response(JSON.stringify(respuesta.body), { status: respuesta.status })
    }) as unknown as typeof fetch
}

describe('pedirRespuestaMultimodal', () => {
    it('manda la imagen como image_url y el PDF como file, en el último mensaje del usuario', async () => {
        let body!: CuerpoEnviado
        await pedirRespuestaMultimodal(entrada({ fetchImpl: fetchFalso({ status: 200, body: { choices: [{ message: { content: '{}' } }], model: 'gpt-4.1' } }, b => { body = b }) }))
        const ultimo = body.messages.at(-1) as { role: string; content: unknown[] }
        expect(ultimo.role).toBe('user')
        expect(ultimo.content[0]).toEqual({ type: 'text', text: 'mirá esta captura' })
        expect(ultimo.content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } })
        expect(ultimo.content[2]).toEqual({ type: 'file', file: { filename: 'otra.pdf', file_data: 'data:application/pdf;base64,BBB' } })
    })
    it('lleva el sistema, el historial en orden y pide JSON', async () => {
        let body!: CuerpoEnviado
        await pedirRespuestaMultimodal(entrada({ fetchImpl: fetchFalso({ status: 200, body: { choices: [{ message: { content: '{}' } }] } }, b => { body = b }) }))
        expect(body.messages[0]).toEqual({ role: 'system', content: 'sos el asistente' })
        expect(body.messages[1]).toEqual({ role: 'user', content: 'hola' })
        expect(body.messages[2].role).toBe('assistant')
        expect(body.response_format).toEqual({ type: 'json_object' })
        expect(body.model).toBe('gpt-4.1')
    })
    it('devuelve el contenido, el modelo y los tokens', async () => {
        const r = await pedirRespuestaMultimodal(entrada({ fetchImpl: fetchFalso({ status: 200, body: { choices: [{ message: { content: '{"a":1}' } }], model: 'gpt-4.1-2025', usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } } }) }))
        expect(r).toEqual({ content: '{"a":1}', model: 'gpt-4.1-2025', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } })
    })
    it('un error del proveedor sale con mensaje legible', async () => {
        await expect(pedirRespuestaMultimodal(entrada({ fetchImpl: fetchFalso({ status: 400, body: { error: { message: 'file too large' } } }) })))
            .rejects.toThrow(/400.*file too large/)
    })
    it('corta por tiempo', async () => {
        const lento = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))) as unknown as typeof fetch
        await expect(pedirRespuestaMultimodal(entrada({ timeoutMs: 20, fetchImpl: lento }))).rejects.toThrow(/tardó demasiado/)
    })
    it('sin clave no llama a nadie', async () => {
        await expect(pedirRespuestaMultimodal(entrada({ apiKey: '' }))).rejects.toThrow(/clave/)
    })
})

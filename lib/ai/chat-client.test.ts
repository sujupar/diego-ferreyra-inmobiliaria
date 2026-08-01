import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatCompletion } from './chat-client'

/**
 * Lo que se prueba acá es el techo de TIEMPO, no el proveedor: una llamada sin
 * corte puede colgarse hasta que Netlify mate la función entera (~26s) y Meta
 * nunca reciba el 200 del webhook. El resto de los llamadores (carruseles,
 * avatares, descripciones de portal) corren fuera de un webhook y no deben
 * cambiar de comportamiento — de ahí que el timeout sea OPCIONAL.
 */

const fetchMock = vi.fn()

function okResponse(content = '{"ok":true}') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  process.env.DEEPSEEK_API_KEY = 'test-key'
  fetchMock.mockResolvedValue(okResponse())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chatCompletion — techo de tiempo', () => {
  it('sin timeoutMs NO manda signal (los llamadores de siempre no cambian)', async () => {
    await chatCompletion({ messages: [{ role: 'user', content: 'hola' }] })
    const init = fetchMock.mock.calls[0][1]
    expect(init.signal).toBeUndefined()
  })

  it('con timeoutMs manda un AbortSignal al fetch', async () => {
    await chatCompletion({ messages: [{ role: 'user', content: 'hola' }], timeoutMs: 10_000 })
    const init = fetchMock.mock.calls[0][1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal.aborted).toBe(false)
  })

  it('el signal aborta solo cuando se cumple el plazo', async () => {
    // Timers REALES a propósito: `AbortSignal.timeout` corre sobre un timer
    // interno de Node que los fake timers de Vitest no manejan — con
    // `useFakeTimers` el signal nunca aborta y el test miente en verde.
    let capturado: AbortSignal | undefined
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      capturado = init.signal as AbortSignal
      return Promise.resolve(okResponse())
    })

    await chatCompletion({ messages: [{ role: 'user', content: 'hola' }], timeoutMs: 20 })
    expect(capturado?.aborted).toBe(false)

    await new Promise((r) => setTimeout(r, 60))
    expect(capturado?.aborted).toBe(true)
  })
})

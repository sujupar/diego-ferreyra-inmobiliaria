/**
 * Regla dura del proyecto: NUNCA encadenar varias llamadas de IA dentro de UN
 * request. Las funciones de Netlify se cortan bastante antes de los 60s y
 * `maxDuration` no sirve ahí; cuando se pasan, el gateway devuelve una página
 * HTML de error 504 y el `res.json()` del cliente explota con
 * «Unexpected token '<'». Ya nos mordió dos veces (carruseles, creación de
 * landing), así que el conteo de llamadas queda atado por un test.
 *
 * Este archivo va aparte de `generator.test.ts` a propósito: mockea el cliente
 * del modelo para todo el archivo, y ese test no lo mockea.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { llamadas } = vi.hoisted(() => ({ llamadas: { chat: vi.fn() } }))

vi.mock('@/lib/ai/chat-client', () => ({
  chatCompletion: (...args: unknown[]) => llamadas.chat(...(args as [])),
}))

import { generatePortalDescription } from './generator'

const datos = {
  property_type: 'departamento', address: 'Junín 1200', neighborhood: 'Recoleta',
  city: 'CABA', operation_type: 'venta', asking_price: 250000, currency: 'USD', rooms: 3,
}

beforeEach(() => {
  llamadas.chat = vi.fn(async () => ({
    content: JSON.stringify({ title: 'T', subtitle: 'S', body: 'B' }),
    provider: 'deepseek',
    model: 'deepseek-chat',
  }))
})

describe('generatePortalDescription', () => {
  it('hace UNA sola llamada al modelo por request', async () => {
    await generatePortalDescription({ property: datos })
    expect(llamadas.chat).toHaveBeenCalledTimes(1)
  })

  it('propaga el techo de tiempo cuando el llamador lo pide', async () => {
    await generatePortalDescription({ property: datos, timeoutMs: 24_000 })
    expect(llamadas.chat.mock.calls[0][0]).toMatchObject({ timeoutMs: 24_000 })
  })

  it('sin techo de tiempo, el comportamiento de siempre: no manda ninguno', async () => {
    await generatePortalDescription({ property: datos })
    expect((llamadas.chat.mock.calls[0][0] as { timeoutMs?: number }).timeoutMs).toBeUndefined()
  })

  it('un corte de tiempo del cliente sube tal cual para que la ruta lo traduzca', async () => {
    llamadas.chat = vi.fn(async () => {
      const err = new Error('signal timed out')
      err.name = 'TimeoutError'
      throw err
    })
    await expect(generatePortalDescription({ property: datos, timeoutMs: 10 }))
      .rejects.toMatchObject({ name: 'TimeoutError' })
  })
})

import { describe, it, expect } from 'vitest'
import { leerRespuesta } from './leer-respuesta'

describe('leerRespuesta', () => {
  it('2xx con `data` → éxito con ese dato', async () => {
    const res = new Response(JSON.stringify({ data: [1, 2, 3] }), { status: 200 })
    expect(await leerRespuesta<number[]>(res)).toEqual({ ok: true, data: [1, 2, 3] })
  })

  it('2xx SIN `data` → error (respuesta inesperada, no un éxito vacío)', async () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 200 })
    expect(await leerRespuesta(res)).toEqual({
      ok: false, status: 200, error: 'Respuesta inesperada del servidor. Probá de nuevo.', cuerpo: { ok: true },
    })
  })

  it('409 con error en JSON → usa el mensaje del servidor', async () => {
    const res = new Response(JSON.stringify({ error: 'No tenés permiso', code: 'X' }), { status: 409 })
    expect(await leerRespuesta(res)).toEqual({
      ok: false, status: 409, error: 'No tenés permiso', cuerpo: { error: 'No tenés permiso', code: 'X' },
    })
  })

  it('504 con HTML del gateway → mensaje de demora, nunca el parseo roto', async () => {
    const res = new Response('<html><body>Gateway Timeout</body></html>', { status: 504 })
    expect(await leerRespuesta(res)).toEqual({
      ok: false, status: 504, error: 'El servidor tardó demasiado. Probá de nuevo.', cuerpo: {},
    })
  })
})

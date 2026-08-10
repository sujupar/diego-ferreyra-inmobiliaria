import { describe, it, expect } from 'vitest'
import { leerJson } from './leer-json'

/**
 * El lector tolerante existe porque el gateway, cuando una función se pasa del
 * tiempo máximo, devuelve una página HTML de error. Un `res.json()` pelado TIRA
 * ahí, y esa excepción dejaba el botón "Siguiente" de los asistentes de
 * MercadoLibre y Argenprop trabado en "Guardando…" para siempre.
 */
function respuesta(cuerpo: string, ok: boolean, status: number): Response {
  return { ok, status, text: async () => cuerpo } as unknown as Response
}

describe('leerJson', () => {
  it('devuelve el JSON cuando el cuerpo es JSON', async () => {
    const r = await leerJson<{ validation?: { ok: boolean } }>(
      respuesta('{"validation":{"ok":true}}', true, 200),
    )
    expect(r.validation).toEqual({ ok: true })
    expect(r.error).toBeUndefined()
  })

  it('conserva el mensaje de error del servidor cuando viene en JSON', async () => {
    const r = await leerJson(respuesta('{"error":"Faltan las fotos"}', false, 400))
    expect(r.error).toBe('Faltan las fotos')
  })

  it('no TIRA ante la página HTML de un 504: devuelve un error legible', async () => {
    const r = await leerJson(respuesta('<HTML><head>Gateway Timeout</head></HTML>', false, 504))
    expect(r.error).toMatch(/tardó demasiado/i)
    expect(r.error).not.toMatch(/Unexpected token/i)
  })

  it('trata 502 y 408 igual que el 504', async () => {
    expect((await leerJson(respuesta('<html>', false, 502))).error).toMatch(/tardó demasiado/i)
    expect((await leerJson(respuesta('', false, 408))).error).toMatch(/tardó demasiado/i)
  })

  it('ante 401 manda a volver a entrar, no a "reintentar"', async () => {
    const r = await leerJson(respuesta('<html>login</html>', false, 401))
    expect(r.error).toMatch(/sesión|permiso/i)
  })

  it('ante cualquier otro cuerpo no-JSON dice el código de estado', async () => {
    const r = await leerJson(respuesta('vaya lío', false, 500))
    expect(r.error).toMatch(/500/)
  })

  it('no TIRA si el cuerpo se corta a mitad de camino', async () => {
    const rota = {
      ok: false, status: 200,
      text: async () => { throw new Error('network error') },
    } as unknown as Response
    const r = await leerJson(rota)
    expect(r.error).toMatch(/conexión/i)
  })
})

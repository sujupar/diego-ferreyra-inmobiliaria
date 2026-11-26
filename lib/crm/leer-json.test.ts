import { describe, it, expect } from 'vitest'
import { leerJson, MENSAJE_SERVIDOR_TARDO, MENSAJE_GENERICO } from './leer-json'

const respuesta = (cuerpo: string, status = 200, tipo = 'application/json') =>
  new Response(cuerpo, { status, headers: { 'content-type': tipo } })

describe('leerJson', () => {
  it('JSON válido con 200 → ok con los datos', async () => {
    expect(await leerJson<{ a: number }>(respuesta('{"a":1}'))).toEqual({ ok: true, status: 200, data: { a: 1 } })
  })
  it('HTML de un 504 de Netlify → error legible, no "Unexpected token"', async () => {
    const r = await leerJson(respuesta('<HTML><HEAD><TITLE>Inactivity Timeout</TITLE></HEAD></HTML>', 504, 'text/html'))
    expect(r).toEqual({ ok: false, status: 504, error: MENSAJE_SERVIDOR_TARDO })
    expect(MENSAJE_SERVIDOR_TARDO).toBe('El servidor tardó demasiado. Probá de nuevo.')
  })
  it('HTML con un 200 también es un error legible', async () => {
    const r = await leerJson(respuesta('<!DOCTYPE html><html></html>', 200, 'text/html'))
    expect(r.ok).toBe(false)
  })
  it('cuerpo vacío → error', async () => {
    const r = await leerJson(respuesta('', 200))
    expect(r).toEqual({ ok: false, status: 200, error: MENSAJE_GENERICO })
  })
  it('error con JSON { error } → devuelve ese texto', async () => {
    expect(await leerJson(respuesta('{"error":"No encontramos este contacto"}', 404))).toEqual({
      ok: false,
      status: 404,
      error: 'No encontramos este contacto',
    })
  })
  it('error con JSON sin campo error → mensaje genérico', async () => {
    expect(await leerJson(respuesta('{"x":1}', 500))).toEqual({ ok: false, status: 500, error: MENSAJE_GENERICO, data: { x: 1 } })
  })
  it('error con JSON { error } vacío → mensaje genérico', async () => {
    expect(await leerJson(respuesta('{"error":"  "}', 400))).toEqual({ ok: false, status: 400, error: MENSAJE_GENERICO })
  })
  it('un 409 con JSON trae los datos además del error', async () => {
    const r = await leerJson(respuesta('{"error":"Ya cambió","propertyId":"p1"}', 409))
    expect(r).toEqual({ ok: false, status: 409, error: 'Ya cambió', data: { error: 'Ya cambió', propertyId: 'p1' } })
  })
  it('la red que falla (el cuerpo no se puede leer) → error legible', async () => {
    const rota = { ok: true, status: 200, text: () => Promise.reject(new Error('network')) } as unknown as Response
    expect(await leerJson(rota)).toEqual({ ok: false, status: 200, error: MENSAJE_GENERICO })
  })
})

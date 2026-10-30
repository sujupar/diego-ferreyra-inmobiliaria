import { describe, it, expect } from 'vitest'
import { contarAvisosSinPropiedad, falloDeRespuesta } from './avisos-carga'

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('falloDeRespuesta', () => {
  it('401 manda a re-loguear y no ofrece reintentar', () => {
    const f = falloDeRespuesta(401, 'los avisos pendientes')
    expect(f.sesionVencida).toBe(true)
    expect(f.reintentable).toBe(false)
    expect(f.motivo).toMatch(/sesión/i)
  })

  it('403 explica que es un problema de permiso, no de datos', () => {
    const f = falloDeRespuesta(403, 'los avisos pendientes')
    expect(f.sesionVencida).toBe(false)
    expect(f.reintentable).toBe(false)
    expect(f.motivo).toMatch(/permiso/i)
  })

  it('500 sí ofrece reintentar y dice el código', () => {
    const f = falloDeRespuesta(500, 'los avisos pendientes')
    expect(f.reintentable).toBe(true)
    expect(f.motivo).toContain('500')
  })
})

describe('contarAvisosSinPropiedad', () => {
  it('cuenta los avisos de la hoja de Consultas (los mismos que se ven al abrirla)', async () => {
    let pedido = ''
    const r = await contarAvisosSinPropiedad(async (url) => {
      pedido = url
      return respuesta(200, { avisos: [{ codigo: 'A' }, { codigo: 'B' }], sueltas: 3 })
    })
    expect(pedido).toBe('/api/consultas/avisos')
    expect(r).toEqual({ ok: true, valor: 2 })
  })

  it('sin avisos es `ok` con 0', async () => {
    expect(await contarAvisosSinPropiedad(async () => respuesta(200, { avisos: [], sueltas: 0 }))).toEqual({ ok: true, valor: 0 })
  })

  it.each([401, 403, 500])('un %i NO se convierte en "no hay avisos"', async (status) => {
    const r = await contarAvisosSinPropiedad(async () => respuesta(status, { error: 'x' }))
    expect(r.ok).toBe(false)
  })

  it('un cuerpo que no es JSON (página de error del gateway) tampoco pasa por vacío', async () => {
    const r = await contarAvisosSinPropiedad(async () => new Response('<html>504</html>', { status: 200 }))
    expect(r.ok).toBe(false)
  })

  it('una respuesta sin la lista tampoco pasa por vacío', async () => {
    const r = await contarAvisosSinPropiedad(async () => respuesta(200, { data: [] }))
    expect(r.ok).toBe(false)
  })

  it('si el fetch ni sale, se avisa la falla de red', async () => {
    const r = await contarAvisosSinPropiedad(async () => {
      throw new Error('offline')
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.reintentable).toBe(true)
  })
})

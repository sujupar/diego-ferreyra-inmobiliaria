import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { esComentarioDeLaCuenta, responderComentario } from './comentarios'

const IG = '17841421542114621'

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'token-de-prueba'
  process.env.META_INSTAGRAM_ACCOUNT_ID = IG
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('responderComentario', () => {
  it('responde en el hilo del comentario, no como comentario suelto', async () => {
    const espia = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"id":"r1"}' })
    vi.stubGlobal('fetch', espia)

    await responderComentario('c1', '¡Gracias por comentar! 🙌')

    const [url, init] = espia.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/c1/replies')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string).message).toBe('¡Gracias por comentar! 🙌')
  })

  it('no manda una respuesta vacía', async () => {
    // Instagram la rechazaría, y además un comentario en blanco abajo del reel
    // se ve como un error del sistema.
    const espia = vi.fn()
    vi.stubGlobal('fetch', espia)
    await expect(responderComentario('c1', '   ')).rejects.toThrow(/vacía/i)
    expect(espia).not.toHaveBeenCalled()
  })

  it('recorta al límite de Instagram en vez de que rechace todo', async () => {
    const espia = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"id":"r1"}' })
    vi.stubGlobal('fetch', espia)

    await responderComentario('c1', 'x'.repeat(3000))

    const mensaje = JSON.parse((espia.mock.calls[0][1] as RequestInit).body as string).message as string
    expect(mensaje.length).toBeLessThanOrEqual(2200)
  })
})

describe('esComentarioDeLaCuenta', () => {
  it('reconoce nuestras propias respuestas', () => {
    // Entran por el mismo webhook: sin este freno el sistema se contesta solo.
    expect(esComentarioDeLaCuenta(IG)).toBe(true)
  })

  it('un comentario de otra persona no es nuestro', () => {
    expect(esComentarioDeLaCuenta('1133632795784463')).toBe(false)
  })

  it('sin identificador de autor se asume ajeno, no propio', () => {
    // Asumirlo propio silenciaría comentarios reales de gente real.
    expect(esComentarioDeLaCuenta(null)).toBe(false)
    expect(esComentarioDeLaCuenta(undefined)).toBe(false)
  })
})

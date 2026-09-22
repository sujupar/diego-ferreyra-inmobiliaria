import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErrorInstagram, esReintentable, instagramFetch, mensajeLegible } from './client'

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'token-de-prueba'
  process.env.META_INSTAGRAM_ACCOUNT_ID = '17841421542114621'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function respuesta(ok: boolean, status: number, texto: string) {
  return { ok, status, text: async () => texto }
}

describe('instagramFetch', () => {
  it('devuelve el cuerpo parseado cuando todo va bien', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(true, 200, '{"id":"abc"}')))
    expect(await instagramFetch<{ id: string }>('/algo')).toEqual({ id: 'abc' })
  })

  it('manda el token como parámetro y no lo repite si la ruta ya tiene otros', async () => {
    const espia = vi.fn().mockResolvedValue(respuesta(true, 200, '{}'))
    vi.stubGlobal('fetch', espia)
    await instagramFetch('/algo?fields=id')
    const url = espia.mock.calls[0][0] as string
    expect(url).toContain('/v21.0/algo?fields=id&access_token=token-de-prueba')
  })

  it('un error HTML NO explota con "Unexpected token" — conserva lo que pasó', async () => {
    // Es el caso que ya mordió a este proyecto: cuando el gateway devuelve una
    // página de error, `res.json()` tira un mensaje que no dice nada del
    // problema real y el diagnóstico arranca de cero.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(false, 504, '<html>Gateway Timeout</html>')))
    await expect(instagramFetch('/algo')).rejects.toThrow(/504/)
    await expect(instagramFetch('/algo')).rejects.not.toThrow(/Unexpected token/)
  })

  it('una respuesta 200 que no es JSON tampoco explota sin explicación', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(true, 200, '<html>ups</html>')))
    await expect(instagramFetch('/algo')).rejects.toThrow(/no es JSON/)
  })

  it('conserva el código y el subcódigo de Meta para poder traducirlos', async () => {
    const cuerpo = JSON.stringify({ error: { message: 'malo', code: 100, error_subcode: 33 } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(false, 400, cuerpo)))
    try {
      await instagramFetch('/algo')
      expect.unreachable('tenía que fallar')
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorInstagram)
      expect((e as ErrorInstagram).code).toBe(100)
      expect((e as ErrorInstagram).subcode).toBe(33)
      expect((e as ErrorInstagram).crudo).toBe(cuerpo)
    }
  })

  it('falla claro si falta el token, sin llamar a la red', async () => {
    delete process.env.META_ACCESS_TOKEN
    const espia = vi.fn()
    vi.stubGlobal('fetch', espia)
    await expect(instagramFetch('/algo')).rejects.toThrow(/META_ACCESS_TOKEN/)
    expect(espia).not.toHaveBeenCalled()
  })
})

describe('mensajeLegible', () => {
  it('traduce el error de permisos que da HOY la cuenta', () => {
    // Verificado contra la cuenta real el 2026-09-22: /{ig}/messages devuelve
    // code 3. Sin traducir, el asesor leería "(#3) Application does not have
    // the capability to make this API call".
    const e = new ErrorInstagram('(#3) Application does not have the capability', 400, '', 3)
    expect(mensajeLegible(e)).toMatch(/permiso de mensajes privados/i)
    expect(mensajeLegible(e)).toContain('pages_messaging')
  })

  it('traduce también el 230, que es el mismo problema por la página', () => {
    const e = new ErrorInstagram('(#230) Requires pages_messaging permission', 400, '', 230)
    expect(mensajeLegible(e)).toMatch(/permiso de mensajes privados/i)
  })

  it('explica el contenido inexistente', () => {
    const e = new ErrorInstagram('no existe', 400, '', 100, 33)
    expect(mensajeLegible(e)).toMatch(/no encontró/i)
  })

  it('explica el token vencido', () => {
    expect(mensajeLegible(new ErrorInstagram('x', 400, '', 190))).toMatch(/token/i)
  })

  it('un error que no conoce devuelve el mensaje de Meta, no una cadena vacía', () => {
    const e = new ErrorInstagram('Instagram 400: algo muy raro', 400, '', 9999)
    expect(mensajeLegible(e)).toBe('Instagram 400: algo muy raro')
  })

  it('tolera cosas que ni siquiera son errores de Instagram', () => {
    expect(mensajeLegible(new Error('se cayó la red'))).toBe('se cayó la red')
    expect(mensajeLegible('un string suelto')).toBeTruthy()
  })
})

describe('esReintentable', () => {
  it('reintenta lo que es pasajero', () => {
    expect(esReintentable(new ErrorInstagram('x', 500, ''))).toBe(true)
    expect(esReintentable(new ErrorInstagram('x', 429, ''))).toBe(true)
    expect(esReintentable(new ErrorInstagram('x', 400, '', 4))).toBe(true)
  })

  it('NO reintenta lo que va a fallar igual', () => {
    // Reintentar un permiso faltante es quemar tiempo del webhook por nada.
    expect(esReintentable(new ErrorInstagram('x', 400, '', 3))).toBe(false)
    expect(esReintentable(new ErrorInstagram('x', 400, '', 190))).toBe(false)
    expect(esReintentable(new Error('otra cosa'))).toBe(false)
  })
})

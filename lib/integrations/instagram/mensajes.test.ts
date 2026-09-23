import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DATO_BOTON, datoDelBoton, leerDatoDelBoton, mandarPrivadoConBoton, mandarTexto } from './mensajes'
import { olvidarPaginaCacheada } from './client'

const IG = '17841421542114621'
const PAGINA = '103823292484521'

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'token-de-prueba'
  process.env.META_INSTAGRAM_ACCOUNT_ID = IG
  olvidarPaginaCacheada()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** La cuenta tiene dos páginas: la que importa es la conectada a ESTE Instagram. */
const CUENTAS = JSON.stringify({
  data: [
    { id: '999', access_token: 'token-de-otra-pagina' },
    { id: PAGINA, access_token: 'token-de-la-pagina', instagram_business_account: { id: IG } },
  ],
})

/**
 * El privado sale por la PÁGINA: primero se pide la página y su token
 * (/me/accounts) y después se manda. Esta función responde a las dos llamadas.
 */
function responde(texto: string, ok = true, status = 200) {
  return vi.fn(async (url: string) =>
    String(url).includes('/me/accounts')
      ? { ok: true, status: 200, text: async () => CUENTAS }
      : { ok, status, text: async () => texto })
}

function llamadaDeEnvio(espia: ReturnType<typeof responde>): [string, RequestInit] {
  const llamada = espia.mock.calls.find(([url]) => !String(url).includes('/me/accounts'))
  return llamada as unknown as [string, RequestInit]
}

describe('el dato escondido en el botón', () => {
  it('viaja con el identificador del reel', () => {
    expect(datoDelBoton('abc-123')).toBe(`${DATO_BOTON}abc-123`)
  })

  it('se puede volver a leer', () => {
    expect(leerDatoDelBoton(datoDelBoton('abc-123'))).toBe('abc-123')
  })

  it('un dato de otra cosa devuelve null en vez de un id inventado', () => {
    // Si devolviera algo, le mandaríamos a la persona la landing de una
    // propiedad que no tiene nada que ver con lo que estaba mirando.
    expect(leerDatoDelBoton('cualquier cosa')).toBeNull()
    expect(leerDatoDelBoton('')).toBeNull()
    expect(leerDatoDelBoton(null)).toBeNull()
  })
})

describe('mandarPrivadoConBoton', () => {
  it('manda el botón como respuesta rápida, con el dato del reel adentro', async () => {
    // El dato viaja en el botón para saber DE QUÉ propiedad hablaba la persona
    // sin cruzar identificadores de usuario: el del que comenta y el del que
    // escribe por privado no siempre son el mismo.
    const espia = responde('{"message_id":"m1"}')
    vi.stubGlobal('fetch', espia)

    await mandarPrivadoConBoton({
      comentarioId: 'c1',
      texto: 'Hola, te paso la ficha',
      textoBoton: 'Sí, pasámela',
      reelId: 'abc-123',
    })

    const [url, init] = llamadaDeEnvio(espia)
    // Por la página y con el token DE LA PÁGINA: el camino /{ig}/messages con el
    // token de sistema da "(#3) la app no tiene la capacidad" con cualquier
    // token (verificado contra Meta el 2026-09-23).
    expect(url).toContain(`/${PAGINA}/messages`)
    expect(url).toContain('access_token=token-de-la-pagina')
    expect(url).not.toContain('token-de-prueba')
    const cuerpo = JSON.parse(init.body as string)
    expect(cuerpo.recipient).toEqual({ comment_id: 'c1' })
    expect(cuerpo.message.text).toBe('Hola, te paso la ficha')
    expect(cuerpo.message.quick_replies).toEqual([
      { content_type: 'text', title: 'Sí, pasámela', payload: `${DATO_BOTON}abc-123` },
    ])
  })

  it('recorta el texto del botón al límite de Instagram', async () => {
    // Instagram acepta 20 caracteres en el título de una respuesta rápida. Si se
    // pasa, RECHAZA el mensaje entero: la persona no recibe nada y el asesor no
    // se entera. Mejor un botón recortado que ningún mensaje.
    const espia = responde('{"message_id":"m1"}')
    vi.stubGlobal('fetch', espia)

    await mandarPrivadoConBoton({
      comentarioId: 'c1',
      texto: 'Hola',
      textoBoton: 'Sí, pasámela por favor que la quiero ver ya mismo',
      reelId: 'abc',
    })

    const titulo = JSON.parse((llamadaDeEnvio(espia)[1]).body as string)
      .message.quick_replies[0].title as string
    expect(titulo.length).toBeLessThanOrEqual(20)
  })

  it('recorta el texto del mensaje al límite de Instagram', async () => {
    const espia = responde('{"message_id":"m1"}')
    vi.stubGlobal('fetch', espia)

    await mandarPrivadoConBoton({
      comentarioId: 'c1',
      texto: 'x'.repeat(1200),
      textoBoton: 'Sí',
      reelId: 'abc',
    })

    const texto = JSON.parse((llamadaDeEnvio(espia)[1]).body as string)
      .message.text as string
    expect(texto.length).toBeLessThanOrEqual(1000)
  })

  it('con el texto del botón vacío no manda un botón sin nombre', async () => {
    const espia = responde('{"message_id":"m1"}')
    vi.stubGlobal('fetch', espia)

    await mandarPrivadoConBoton({ comentarioId: 'c1', texto: 'Hola', textoBoton: '   ', reelId: 'abc' })

    const titulo = JSON.parse((llamadaDeEnvio(espia)[1]).body as string)
      .message.quick_replies[0].title as string
    expect(titulo.trim().length).toBeGreaterThan(0)
  })

  it('traduce el error de permisos que da HOY la cuenta', async () => {
    // Verificado el 2026-09-22 contra la cuenta real.
    const cuerpo = JSON.stringify({
      error: { code: 3, message: '(#3) Application does not have the capability to make this API call.' },
    })
    vi.stubGlobal('fetch', responde(cuerpo, false, 400))

    await expect(
      mandarPrivadoConBoton({ comentarioId: 'c1', texto: 'Hola', textoBoton: 'Sí', reelId: 'abc' }),
    ).rejects.toThrow(/Application does not have the capability|capability/)
  })
})

describe('mandarTexto', () => {
  it('le escribe a la persona por su identificador de chat', async () => {
    const espia = responde('{"message_id":"m2"}')
    vi.stubGlobal('fetch', espia)

    await mandarTexto({ destinatarioId: 'u1', texto: 'Acá la tenés 👇 https://inmodf.com.ar/p/abc' })

    const cuerpo = JSON.parse((llamadaDeEnvio(espia)[1]).body as string)
    expect(cuerpo.recipient).toEqual({ id: 'u1' })
    expect(cuerpo.message.text).toContain('https://inmodf.com.ar/p/abc')
    expect(cuerpo.message.quick_replies).toBeUndefined()
  })

  it('NUNCA recorta a la mitad de un enlace', async () => {
    // Media URL no es un enlace: si hay que recortar, se recorta el texto de
    // antes, nunca el enlace. Es la misma regla del acortador de WhatsApp.
    const espia = responde('{"message_id":"m2"}')
    vi.stubGlobal('fetch', espia)
    const enlace = 'https://inmodf.com.ar/p/una-propiedad-con-nombre-largo'

    await mandarTexto({ destinatarioId: 'u1', texto: 'x'.repeat(1200) + '\n' + enlace })

    const texto = JSON.parse((llamadaDeEnvio(espia)[1]).body as string).message.text as string
    expect(texto.length).toBeLessThanOrEqual(1000)
    expect(texto).toContain(enlace)
  })
})

describe('la página por la que sale el privado', () => {
  it('se pide una sola vez y se reusa', async () => {
    const espia = responde('{"message_id":"m1"}')
    vi.stubGlobal('fetch', espia)
    await mandarTexto({ destinatarioId: 'u1', texto: 'a' })
    await mandarTexto({ destinatarioId: 'u2', texto: 'b' })
    expect(espia.mock.calls.filter(([url]) => String(url).includes('/me/accounts'))).toHaveLength(1)
  })

  it('si ninguna página está conectada a la cuenta de Instagram, el error se entiende', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: '999', access_token: 'x' }] }) })))
    await expect(mandarTexto({ destinatarioId: 'u1', texto: 'a' })).rejects.toThrow(/página de Facebook/)
  })

  it('un fallo al pedir la página no queda guardado: el siguiente intento vuelve a preguntar', async () => {
    const fallo = vi.fn(async () => ({ ok: false, status: 500, text: async () => '{"error":{"message":"caído"}}' }))
    vi.stubGlobal('fetch', fallo)
    await expect(mandarTexto({ destinatarioId: 'u1', texto: 'a' })).rejects.toThrow()
    const espia = responde('{"message_id":"m1"}')
    vi.stubGlobal('fetch', espia)
    await mandarTexto({ destinatarioId: 'u1', texto: 'a' })
    expect(llamadaDeEnvio(espia)[0]).toContain(`/${PAGINA}/messages`)
  })
})

describe('si el token de la página deja de ser válido', () => {
  it('se descarta el guardado y el siguiente envío pide la página de nuevo', async () => {
    // Sin esto, un token de página vencido quedaba en memoria y TODOS los
    // privados fallaban hasta el próximo deploy (revisión de código).
    let envios = 0
    const espia = vi.fn(async (url: string) => {
      if (String(url).includes('/me/accounts')) return { ok: true, status: 200, text: async () => CUENTAS }
      envios++
      return envios === 1
        ? { ok: false, status: 400, text: async () => '{"error":{"message":"token vencido","code":190}}' }
        : { ok: true, status: 200, text: async () => '{"message_id":"m1"}' }
    })
    vi.stubGlobal('fetch', espia)

    await expect(mandarTexto({ destinatarioId: 'u1', texto: 'a' })).rejects.toThrow()
    await mandarTexto({ destinatarioId: 'u1', texto: 'a' })

    expect(espia.mock.calls.filter(([url]) => String(url).includes('/me/accounts'))).toHaveLength(2)
  })
})

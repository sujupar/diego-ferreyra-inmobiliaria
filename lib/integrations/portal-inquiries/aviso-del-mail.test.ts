import { describe, it, expect, vi } from 'vitest'
import {
  avisoZonapropLimpio,
  enlacesDeClicZonaprop,
  fotoDelAviso,
  resolverAvisoZonaprop,
} from './aviso-del-mail'

// Recorte del mail real de ZonaProp del 2026-10-30 (solo los enlaces, sin datos de personas).
const CLIC_LOGO = 'http://link.zonaprop.com.ar/ls/click?upn=u001.LOGO'
const CLIC_AVISO = 'http://link.zonaprop.com.ar/ls/click?upn=u001.AVISO'
const CLIC_PANEL = 'http://link.zonaprop.com.ar/ls/click?upn=u001.PANEL'
const MAIL_ZP = `
  <a href="${CLIC_LOGO}"><img src="https://www.zonaprop.com.ar/logo.png"></a>
  <img src="https://imgar.zonapropcdn.com/avisos/1/00/60/36/03/54/200x149/2083536250.jpg">
  <img src="https://imgar.zonapropcdn.com/avisos/1/00/60/36/03/54/290x180/2083536250.jpg">
  <a href="${CLIC_AVISO}">Ver aviso</a><a href="${CLIC_AVISO}">Ver</a>
  <a href="${CLIC_PANEL}">Panel</a>
  <img src="http://link.zonaprop.com.ar/wf/open?upn=u001.PIXEL">`

const DESTINOS: Record<string, string> = {
  [CLIC_LOGO]: 'https://www.zonaprop.com.ar?utm_source=lead',
  [CLIC_AVISO]: 'https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-venta-departamento-60360354.html?utm_source=lead&utm_medium=email#x',
  [CLIC_PANEL]: 'https://www.zonaprop.com.ar/panel/interesados/190247706?utm_source=lead',
}

function redFalsa(destinos: Record<string, string>) {
  return vi.fn(async (url: string) => {
    const location = destinos[url]
    return new Response(null, { status: location ? 302 : 404, headers: location ? { location } : {} })
  })
}

describe('fotoDelAviso', () => {
  it('ZonaProp: toma la foto grande del aviso', () => {
    expect(fotoDelAviso('zonaprop', MAIL_ZP)).toBe('https://imgar.zonapropcdn.com/avisos/1/00/60/36/03/54/290x180/2083536250.jpg')
  })

  it('Argenprop: toma la foto del aviso y no los íconos del mail', () => {
    const html = `<img src="https://www.argenprop.com/content/emails/argenprop-alerts-logo-blanco.png">
      <img src="https://www.argenprop.com/static-content/safe/64929302/7319460f-c5ec.jpg">
      <img src="https://www.argenprop.com/content/emails/datos-comunes/antiguedad.png">`
    expect(fotoDelAviso('argenprop', html)).toBe('https://www.argenprop.com/static-content/safe/64929302/7319460f-c5ec.jpg')
  })

  it('rechaza un host parecido al del portal', () => {
    expect(fotoDelAviso('zonaprop', '<img src="https://imgar.zonapropcdn.com.evil.com/avisos/a.jpg">')).toBeNull()
    expect(fotoDelAviso('argenprop', '<img src="https://argenprop.com.mal.ar/static-content/a.jpg">')).toBeNull()
  })

  it('rechaza una foto sin https', () => {
    expect(fotoDelAviso('zonaprop', '<img src="http://imgar.zonapropcdn.com/avisos/a.jpg">')).toBeNull()
  })

  it('sin html o de MercadoLibre: null', () => {
    expect(fotoDelAviso('zonaprop', '')).toBeNull()
    expect(fotoDelAviso('mercadolibre', MAIL_ZP)).toBeNull()
  })

  it('las entidades HTML del src no rompen la dirección', () => {
    expect(fotoDelAviso('argenprop', '<img src="https://www.argenprop.com/static-content/a.jpg?w=1&amp;h=2">'))
      .toBe('https://www.argenprop.com/static-content/a.jpg?w=1&h=2')
  })
})

describe('enlacesDeClicZonaprop', () => {
  it('los de clic, sin repetir, en orden, y nunca el píxel de apertura', () => {
    expect(enlacesDeClicZonaprop(MAIL_ZP)).toEqual([CLIC_LOGO, CLIC_AVISO, CLIC_PANEL])
  })

  it('ignora un host parecido', () => {
    expect(enlacesDeClicZonaprop('<a href="http://link.zonaprop.com.ar.evil.com/ls/click?upn=x">')).toEqual([])
  })

  it('tiene tope', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => `<a href="http://link.zonaprop.com.ar/ls/click?upn=${i}">`).join('')
    expect(enlacesDeClicZonaprop(muchos)).toHaveLength(8)
  })
})

describe('avisoZonapropLimpio', () => {
  it('saca utm y ancla', () => {
    expect(avisoZonapropLimpio(DESTINOS[CLIC_AVISO]))
      .toBe('https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-venta-departamento-60360354.html')
  })

  it('no acepta otra página de ZonaProp', () => {
    expect(avisoZonapropLimpio(DESTINOS[CLIC_PANEL])).toBeNull()
    expect(avisoZonapropLimpio(DESTINOS[CLIC_LOGO])).toBeNull()
  })

  it('no acepta http ni un host parecido', () => {
    expect(avisoZonapropLimpio('http://www.zonaprop.com.ar/propiedades/clasificado/a-1.html')).toBeNull()
    expect(avisoZonapropLimpio('https://www.zonaprop.com.ar.evil.com/propiedades/clasificado/a-1.html')).toBeNull()
    expect(avisoZonapropLimpio('no es una url')).toBeNull()
  })
})

describe('resolverAvisoZonaprop', () => {
  it('sigue los enlaces hasta el del aviso y no sigue más', async () => {
    const red = redFalsa(DESTINOS)
    const url = await resolverAvisoZonaprop(MAIL_ZP, { fetch: red, techoMs: 5000 })
    expect(url).toBe('https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-venta-departamento-60360354.html')
    expect(red).toHaveBeenCalledTimes(2)
    expect(red.mock.calls.every(([, init]) => (init as RequestInit).redirect === 'manual')).toBe(true)
  })

  it('si la red falla, null sin lanzar', async () => {
    const red = vi.fn(async () => { throw new Error('sin red') })
    await expect(resolverAvisoZonaprop(MAIL_ZP, { fetch: red, techoMs: 5000 })).resolves.toBeNull()
  })

  it('si ningún enlace lleva al aviso, null', async () => {
    const red = redFalsa({ [CLIC_LOGO]: DESTINOS[CLIC_LOGO] })
    await expect(resolverAvisoZonaprop(MAIL_ZP, { fetch: red, techoMs: 5000 })).resolves.toBeNull()
  })

  it('respeta el techo de tiempo', async () => {
    const red = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, rechazar) => {
      init?.signal?.addEventListener('abort', () => rechazar(new Error('abortado')))
    }))
    const inicio = Date.now()
    await expect(resolverAvisoZonaprop(MAIL_ZP, { fetch: red, techoMs: 50 })).resolves.toBeNull()
    expect(Date.now() - inicio).toBeLessThan(1000)
  })

  it('sin enlaces de clic no llama a la red', async () => {
    const red = redFalsa(DESTINOS)
    await expect(resolverAvisoZonaprop('<p>hola</p>', { fetch: red, techoMs: 5000 })).resolves.toBeNull()
    expect(red).not.toHaveBeenCalled()
  })
})

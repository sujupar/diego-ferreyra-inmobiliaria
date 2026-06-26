import { describe, it, expect } from 'vitest'
import { parseInquiry, detectPortal, isLeadEmail, buildGmailQuery, PORTAL_SENDERS } from './index'
import { htmlToText, valueAfterLabel, extractPhone, firstLeadEmail } from './extract'
import type { RawEmail } from './types'

// Fixtures basados en los formatos REALES de la casilla (PII anonimizada).

describe('detectPortal', () => {
  it('detecta por remitente', () => {
    expect(detectPortal('Laura mediante ZonaProp <x@usuarios.zonaprop.com.ar>')).toBe('zonaprop')
    expect(detectPortal('Argenprop <noresponder@argenprop.com>')).toBe('argenprop')
    expect(detectPortal('Mercado Libre <no-responder@mercadolibre.com.ar>')).toBe('mercadolibre')
    expect(detectPortal('Random <hola@gmail.com>')).toBeNull()
  })
})

describe('isLeadEmail (filtra ruido)', () => {
  it('ZonaProp: lead solo vía relay usuarios.zonaprop.com.ar', () => {
    expect(isLeadEmail('Laura mediante ZonaProp <l@usuarios.zonaprop.com.ar>', 'consulta', 'zonaprop')).toBe(true)
    expect(isLeadEmail('ZonaProp <news@zonaprop.com.ar>', 'novedades', 'zonaprop')).toBe(false)
  })
  it('Argenprop: lead solo desde noresponder@', () => {
    expect(isLeadEmail('Argenprop <noresponder@argenprop.com>', 'x contactó por y', 'argenprop')).toBe(true)
    expect(isLeadEmail('Soporte <soporte@argenprop.com>', 'Estimados…', 'argenprop')).toBe(false)
  })
  it('MercadoLibre: factura/marketing se ignoran; pregunta es lead', () => {
    expect(isLeadEmail('ML <no-responder@mercadolibre.com.ar>', 'Tu factura ya está paga', 'mercadolibre')).toBe(false)
    expect(isLeadEmail('ML <info@info.mercadolibre.com.ar>', 'Conocé tu desempeño', 'mercadolibre')).toBe(false)
    expect(isLeadEmail('ML <noreply@mercadolibre.com>', 'Te hicieron una pregunta', 'mercadolibre')).toBe(true)
  })
})

describe('utilidades de extracción', () => {
  it('htmlToText preserva saltos y limpia nbsp', () => {
    const t = htmlToText('<p>Hola&nbsp;mundo</p><br><div>Segunda línea</div>')
    expect(t).toContain('Hola mundo')
    expect(t).toContain('Segunda línea')
  })
  it('valueAfterLabel toma valor en mismo renglón o el siguiente', () => {
    expect(valueAfterLabel('Nombre: Juan Pérez', ['nombre'])).toBe('Juan Pérez')
    expect(valueAfterLabel('Teléfono:\n11 2233 4455', ['teléfono'])).toBe('11 2233 4455')
  })
  it('extractPhone reconoce formatos AR', () => {
    expect(extractPhone('Teléfono: 11 2233 4455')).toMatch(/2233/)
    expect(extractPhone('Cel: +54 9 11 5555-6666')).toMatch(/5555/)
    expect(extractPhone('sin numero aca')).toBeNull()
  })
  it('firstLeadEmail ignora dominios del portal', () => {
    const t = 'De: noreply@zonaprop.com.ar\nEmail: juan.perez@gmail.com'
    expect(firstLeadEmail(t, 'zonaprop')).toBe('juan.perez@gmail.com')
  })
})

// --- ZonaProp (formato real) ---------------------------------------------
const zonapropEmail: RawEmail = {
  from: '"Laura mediante ZonaProp" <laura@usuarios.zonaprop.com.ar>',
  subject: '📱 ¡Consultaron tu WhatsApp en el aviso Venta Casa 4 Ambientes con Cochera + Patio y P ...! CÓD:2CBSS6 - REF:#306958245#',
  text: '',
  html: `<html><body>
    <p>¡Hola, Diego Ferreyra Inmobiliaria! Hay interesados que consultaron tu número de WhatsApp por el siguiente aviso:</p>
    <p>Teléfono: +54 9 11 5323 7239</p>
    <p>Email: laura.buyer@gmail.com</p>
  </body></html>`,
}

describe('parser ZonaProp', () => {
  const r = parseInquiry(zonapropEmail)!
  it('detecta el portal', () => expect(r.portal).toBe('zonaprop'))
  it('tipo whatsapp (asunto lo indica)', () => expect(r.inquiryType).toBe('whatsapp'))
  it('nombre desde el remitente', () => expect(r.leadName).toBe('Laura'))
  it('email del interesado del body', () => expect(r.leadEmail).toBe('laura.buyer@gmail.com'))
  it('teléfono del body', () => expect(r.leadPhone).toMatch(/5323/))
  it('código = CÓD del anunciante', () => expect(r.propertyCode).toBe('2CBSS6'))
  it('título del aviso desde el asunto', () => expect(r.propertyTitle).toMatch(/Venta Casa 4 Ambientes/))
})

// --- Argenprop (formato real) --------------------------------------------
const avisoJson = JSON.stringify({ u: 30952215, v: 2, url: 'https://www.argenprop.com/aviso--18191220' })
const mandrillUrl = `https://mandrillapp.com/track/click/30952215/www.argenprop.com?p=${Buffer.from(avisoJson).toString('base64')}`
const argenpropEmail: RawEmail = {
  from: 'Argenprop <noresponder@argenprop.com>',
  subject: 'juan.perez@gmail.com contactó por Agüero 900 en Palermo',
  text: `Tenés una nueva consulta.
Nombre: Juan Pérez
Email: juan.perez@gmail.com
Teléfono: 11 6682 8072
Ver aviso: ${mandrillUrl}`,
  html: '',
}

describe('parser Argenprop', () => {
  const r = parseInquiry(argenpropEmail)!
  it('detecta el portal', () => expect(r.portal).toBe('argenprop'))
  it('dirección desde el asunto', () => expect(r.propertyAddress).toBe('Agüero 900'))
  it('título incluye dirección y barrio', () => expect(r.propertyTitle).toMatch(/Agüero 900.*Palermo/))
  it('email del interesado', () => expect(r.leadEmail).toBe('juan.perez@gmail.com'))
  it('teléfono del body', () => expect(r.leadPhone).toMatch(/6682/))
  it('código = aviso real (decodificado del link Mandrill, no el tracking id)', () => {
    expect(r.propertyCode).toBe('18191220')
  })
  it('URL = aviso limpio de Argenprop', () => expect(r.propertyUrl).toBe('https://www.argenprop.com/aviso--18191220'))
})

// --- MercadoLibre (sin muestra real; formato genérico de pregunta) --------
const meliEmail: RawEmail = {
  from: 'MercadoLibre <noreply@mercadolibre.com>',
  subject: 'Tenés una nueva pregunta',
  text: '',
  html: `<html><body>
    <p>¡Tenés una nueva pregunta en tu publicación!</p>
    <p>Publicación: Departamento en venta en Caballito</p>
    <p>Pregunta: ¿Está disponible para visitar el fin de semana?</p>
    <a href="https://articulo.mercadolibre.com.ar/MLA-1234567890-departamento-caballito-_JM">Ver publicación</a>
  </body></html>`,
}

describe('parser MercadoLibre', () => {
  const r = parseInquiry(meliEmail)!
  it('es lead (asunto de pregunta)', () => expect(isLeadEmail(meliEmail.from, meliEmail.subject, 'mercadolibre')).toBe(true))
  it('extrae el código MLA del ítem', () => expect(r.propertyCode).toBe('MLA1234567890'))
  it('extrae la pregunta como mensaje', () => expect(r.message).toMatch(/visitar/i))
  it('extrae el título de la publicación', () => expect(r.propertyTitle).toMatch(/Caballito/))
})

describe('buildGmailQuery', () => {
  it('usa los remitentes de leads reales', () => {
    const q = buildGmailQuery(2)
    expect(q).toContain('from:usuarios.zonaprop.com.ar')
    expect(q).toContain('from:noresponder@argenprop.com')
    expect(q).toContain('from:mercadolibre.com')
    expect(q).toContain('newer_than:2d')
  })
  it('tiene remitentes definidos para cada portal', () => {
    expect(PORTAL_SENDERS.zonaprop.length).toBeGreaterThan(0)
  })
})

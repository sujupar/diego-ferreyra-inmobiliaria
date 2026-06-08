import { describe, it, expect } from 'vitest'
import { parseInquiry, detectPortal, buildGmailQuery, PORTAL_SENDERS } from './index'
import { htmlToText, valueAfterLabel, extractPhone, firstLeadEmail } from './extract'
import type { RawEmail } from './types'

// NOTA: estos cuerpos son plausibles pero SINTÉTICOS. Cuando lleguen 2-3 emails
// reales por portal, reemplazar/ampliar estos fixtures con los HTML reales.

describe('detectPortal', () => {
  it('detecta por remitente', () => {
    expect(detectPortal('ZonaProp <noreply@zonaprop.com.ar>')).toBe('zonaprop')
    expect(detectPortal('MercadoLibre <ventas@mercadolibre.com.ar>')).toBe('mercadolibre')
    expect(detectPortal('Argenprop <info@argenprop.com>')).toBe('argenprop')
    expect(detectPortal('Random <hola@gmail.com>')).toBeNull()
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

const whatsappLeadEmail: RawEmail = {
  from: 'ZonaProp <noreply@zonaprop.com.ar>',
  subject: 'Te contactaron por WhatsApp',
  text: 'Un interesado quiere contactarte por WhatsApp.\nNombre: Pedro\nTeléfono: 11 9999 8888',
  html: '',
}

describe('detectInquiryType', () => {
  it('marca whatsapp cuando el email lo menciona', () => {
    expect(parseInquiry(whatsappLeadEmail)!.inquiryType).toBe('whatsapp')
  })
})

const zonapropEmail: RawEmail = {
  from: 'ZonaProp <noreply@zonaprop.com.ar>',
  subject: 'Nueva consulta por tu aviso',
  text: '',
  html: `<html><body>
    <p>Recibiste una nueva consulta por tu aviso en Zonaprop.</p>
    <table>
      <tr><td>Nombre:</td><td>Juan Pérez</td></tr>
      <tr><td>Email:</td><td>juan.perez@gmail.com</td></tr>
      <tr><td>Teléfono:</td><td>11 2233 4455</td></tr>
      <tr><td>Mensaje:</td><td>Hola, me interesa la propiedad, ¿puedo coordinar una visita?</td></tr>
    </table>
    <p>Aviso: Departamento 3 ambientes en Palermo</p>
    <a href="https://www.zonaprop.com.ar/propiedades/depto-palermo-49012345.html">Ver aviso</a>
  </body></html>`,
}

describe('parser ZonaProp', () => {
  const r = parseInquiry(zonapropEmail)!
  it('detecta el portal', () => expect(r.portal).toBe('zonaprop'))
  it('marca el tipo como mail (consulta por formulario)', () => expect(r.inquiryType).toBe('mail'))
  it('extrae el nombre', () => expect(r.leadName).toBe('Juan Pérez'))
  it('extrae el email', () => expect(r.leadEmail).toBe('juan.perez@gmail.com'))
  it('extrae el teléfono', () => expect(r.leadPhone).toMatch(/2233/))
  it('extrae el mensaje', () => expect(r.message).toMatch(/me interesa/i))
  it('extrae el código desde la URL', () => expect(r.propertyCode).toBe('49012345'))
  it('extrae la URL del aviso', () => expect(r.propertyUrl).toContain('zonaprop.com.ar'))
  it('extrae el título', () => expect(r.propertyTitle).toMatch(/Palermo/))
})

const argenpropEmail: RawEmail = {
  from: 'Argenprop <info@argenprop.com>',
  subject: 'Tenés una nueva consulta',
  text: `Tenés una nueva consulta en Argenprop.
Nombre: María Gómez
Email: maria.gomez@hotmail.com
Teléfono: 351 444 5566
Mensaje: ¿La propiedad acepta crédito hipotecario?
Propiedad: Casa en Nueva Córdoba
Ver: https://www.argenprop.com/casa-en-venta-nueva-cordoba--7654321`,
  html: '',
}

describe('parser Argenprop', () => {
  const r = parseInquiry(argenpropEmail)!
  it('detecta el portal', () => expect(r.portal).toBe('argenprop'))
  it('extrae el nombre', () => expect(r.leadName).toBe('María Gómez'))
  it('extrae el email', () => expect(r.leadEmail).toBe('maria.gomez@hotmail.com'))
  it('extrae el teléfono', () => expect(r.leadPhone).toMatch(/444/))
  it('extrae el código desde la URL', () => expect(r.propertyCode).toBe('7654321'))
  it('extrae el título', () => expect(r.propertyTitle).toMatch(/Nueva Córdoba/))
})

const meliEmail: RawEmail = {
  from: 'MercadoLibre <noreply@mercadolibre.com.ar>',
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
  it('detecta el portal', () => expect(r.portal).toBe('mercadolibre'))
  it('extrae el código MLA del ítem', () => expect(r.propertyCode).toBe('MLA1234567890'))
  it('extrae la pregunta como mensaje', () => expect(r.message).toMatch(/visitar/i))
  it('extrae el título de la publicación', () => expect(r.propertyTitle).toMatch(/Caballito/))
  it('email y teléfono quedan null (ML los oculta)', () => {
    expect(r.leadEmail).toBeNull()
    expect(r.leadPhone).toBeNull()
  })
})

describe('buildGmailQuery', () => {
  it('incluye los remitentes de los 3 portales', () => {
    const q = buildGmailQuery(2)
    expect(q).toContain('from:zonaprop.com.ar')
    expect(q).toContain('from:argenprop.com')
    expect(q).toContain('from:mercadolibre.com.ar')
    expect(q).toContain('newer_than:2d')
  })
  it('tiene remitentes definidos para cada portal', () => {
    expect(PORTAL_SENDERS.zonaprop.length).toBeGreaterThan(0)
  })
})

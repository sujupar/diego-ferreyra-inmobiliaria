import { describe, it, expect } from 'vitest'
import {
  MAX_CUERPO_META,
  variantesDeSaludo,
  espacioParaElLink,
  armarLinkRespuesta,
  sanitizarParametro,
  ajustarAlTope,
} from './reply-link'
import { CUERPOS_DE_PLANTILLA, renderCuerpo } from '../whatsapp/cuerpos'

const CUERPO = CUERPOS_DE_PLANTILLA['consulta_portal_util']

/** Los 9 parámetros que NO son el link, tal como los mandó una consulta real. */
const PARAMS_REALES = [
  'DIEGO', '#291', 'ZonaProp', 'Mail', 'Entre Ríos 2300',
  'https://www.zonaprop.com.ar/propiedades/clasificado/veclcain-duplex-4-ambientes-con-cochera-jardin-y-quincho-59885245.html',
  'Viviana López', '541154974791', 'svivilopez@yahoo.com.ar',
]

const SALUDOS = variantesDeSaludo({
  leadName: 'Viviana López',
  advisorName: 'Diego Ferreyra',
  propertyLabel: 'Entre Ríos 2300',
})

describe('variantesDeSaludo', () => {
  it('la primera variante es el saludo completo, con asesor y propiedad', () => {
    expect(SALUDOS[0]).toBe(
      'Hola Viviana López, buen día! Mi nombre es Diego Ferreyra, un gusto saludarte.' +
        ' Te escribo por tu consulta de la propiedad en Entre Ríos 2300.',
    )
  })

  it('van de más larga a más corta y todas terminan en una frase completa', () => {
    expect(SALUDOS.length).toBeGreaterThan(1)
    for (let i = 1; i < SALUDOS.length; i++) {
      expect(SALUDOS[i].length).toBeLessThan(SALUDOS[i - 1].length)
    }
    for (const s of SALUDOS) expect(s).toMatch(/[.!]$/)
  })

  it('sin propiedad identificada el saludo no la menciona', () => {
    const v = variantesDeSaludo({ leadName: 'Ana', advisorName: 'Diego', propertyLabel: null })
    expect(v[0]).toBe(
      'Hola Ana, buen día! Mi nombre es Diego, un gusto saludarte.' +
        ' Te escribo por la consulta que nos hiciste.',
    )
  })

  it('sin nombre del interesado no deja una coma colgada ni doble espacio', () => {
    const v = variantesDeSaludo({ leadName: null, advisorName: 'Diego', propertyLabel: 'Roque Pérez 3059' })
    expect(v[0]).toContain('Hola, buen día!')
    expect(v[0]).not.toContain('Hola ,')
    for (const s of v) expect(s).not.toContain('  ')
  })
})

describe('espacioParaElLink', () => {
  it('descuenta el cuerpo aprobado y los otros nueve parámetros', () => {
    const esperado = MAX_CUERPO_META - renderCuerpo(CUERPO, [...PARAMS_REALES, '']).length
    expect(espacioParaElLink(CUERPO, PARAMS_REALES)).toBe(esperado)
  })

  it('en una consulta real sobra lugar para el saludo completo', () => {
    expect(espacioParaElLink(CUERPO, PARAMS_REALES)).toBeGreaterThan(300)
  })

  it('nunca devuelve un negativo', () => {
    expect(espacioParaElLink(CUERPO, PARAMS_REALES.map(() => 'x'.repeat(400)))).toBe(0)
  })
})

describe('armarLinkRespuesta', () => {
  it('es un wa.me directo — NUNCA un acortador de terceros', () => {
    const link = armarLinkRespuesta('541154974791', SALUDOS, 500)
    expect(link.startsWith('https://wa.me/541154974791?text=')).toBe(true)
    expect(link).not.toContain('tinyurl')
  })

  it('con lugar de sobra precarga el saludo completo', () => {
    const link = armarLinkRespuesta('541154974791', SALUDOS, 500)
    expect(new URL(link).searchParams.get('text')).toBe(SALUDOS[0])
  })

  it('el link no tiene espacios ni saltos: Meta rechaza parámetros con eso', () => {
    const link = armarLinkRespuesta('541154794791', SALUDOS, 500)
    expect(link).not.toMatch(/\s/)
  })

  it('si el saludo completo no entra, usa la variante más larga que sí entre', () => {
    const espacio = 'https://wa.me/541154974791?text='.length + encodeURIComponent(SALUDOS[1]).length
    const link = armarLinkRespuesta('541154974791', SALUDOS, espacio)
    expect(link.length).toBeLessThanOrEqual(espacio)
    expect(new URL(link).searchParams.get('text')).toBe(SALUDOS[1])
  })

  it('si no entra ningún saludo, manda el wa.me pelado — que igual abre el chat', () => {
    expect(armarLinkRespuesta('541154974791', SALUDOS, 40)).toBe('https://wa.me/541154974791')
  })

  it('sea cual sea el espacio, nunca devuelve una URL cortada por la mitad', () => {
    for (let espacio = 0; espacio <= 400; espacio++) {
      const link = armarLinkRespuesta('541154974791', SALUDOS, espacio)
      expect(() => new URL(link)).not.toThrow()
      expect(link).not.toMatch(/%[0-9A-Fa-f]?$/)
      expect(link).not.toMatch(/…$/)
    }
  })

  it('sin teléfono avisa en texto, no devuelve un link roto', () => {
    const link = armarLinkRespuesta(null, SALUDOS, 500)
    expect(link).not.toContain('wa.me')
    expect(link).toContain('teléfono')
  })
})

describe('el cuerpo que recibe Meta', () => {
  it('con una consulta real entra en el tope de 1024', () => {
    const link = armarLinkRespuesta('541154974791', SALUDOS, espacioParaElLink(CUERPO, PARAMS_REALES))
    expect(renderCuerpo(CUERPO, [...PARAMS_REALES, link]).length).toBeLessThanOrEqual(MAX_CUERPO_META)
  })

  it('con el aviso más largo que publica un portal sigue entrando', () => {
    const params = [...PARAMS_REALES]
    params[5] = `https://www.zonaprop.com.ar/propiedades/clasificado/${'x'.repeat(160)}.html`
    const link = armarLinkRespuesta('541154974791', SALUDOS, espacioParaElLink(CUERPO, params))
    expect(renderCuerpo(CUERPO, [...params, link]).length).toBeLessThanOrEqual(MAX_CUERPO_META)
  })
})

describe('sanitizarParametro', () => {
  it('aplasta saltos y tabs: Meta rechaza parámetros con eso', () => {
    expect(sanitizarParametro('Entre Ríos\n\t2300', 120)).toBe('Entre Ríos 2300')
  })

  it('un texto largo se corta con puntos suspensivos', () => {
    const r = sanitizarParametro('x'.repeat(200), 40)
    expect(r).toHaveLength(40)
    expect(r.endsWith('…')).toBe(true)
  })

  it('una URL NO se corta aunque pase el tope: media URL no es un link', () => {
    const url = `https://www.zonaprop.com.ar/propiedades/clasificado/${'x'.repeat(200)}.html`
    expect(sanitizarParametro(url, 120)).toBe(url)
  })

  it('vacío queda como guion, para que el mensaje no muestre un hueco', () => {
    expect(sanitizarParametro(null, 40)).toBe('-')
    expect(sanitizarParametro('   ', 40)).toBe('-')
  })
})

describe('ajustarAlTope', () => {
  const AVISO = 5

  it('si el cuerpo ya entra, no toca ningún parámetro', () => {
    const params = [...PARAMS_REALES, 'https://wa.me/541154974791']
    expect(ajustarAlTope(CUERPO, params, AVISO)).toEqual(params)
  })

  it('si se pasa, cede el aviso y el cuerpo entra en el tope', () => {
    const params = [...PARAMS_REALES, 'https://wa.me/541154974791']
    params[AVISO] = `https://www.zonaprop.com.ar/${'x'.repeat(900)}.html`
    const ajustados = ajustarAlTope(CUERPO, params, AVISO)
    expect(renderCuerpo(CUERPO, ajustados).length).toBeLessThanOrEqual(MAX_CUERPO_META)
  })

  it('el que cede es el aviso: el link de responder queda intacto', () => {
    const link = 'https://wa.me/541154974791?text=Hola'
    const params = [...PARAMS_REALES, link]
    params[AVISO] = `https://www.zonaprop.com.ar/${'x'.repeat(900)}.html`
    const ajustados = ajustarAlTope(CUERPO, params, AVISO)
    expect(ajustados[9]).toBe(link)
    expect(ajustados[0]).toBe(PARAMS_REALES[0])
    expect(ajustados[AVISO].length).toBeLessThan(params[AVISO].length)
  })

  it('en el peor caso el que cede queda vacío, nunca undefined', () => {
    const params = [...PARAMS_REALES, 'https://wa.me/541154974791']
    params[AVISO] = 'x'.repeat(5000)
    params[4] = 'y'.repeat(5000)
    const ajustados = ajustarAlTope(CUERPO, params, AVISO)
    expect(ajustados).toHaveLength(10)
    expect(typeof ajustados[AVISO]).toBe('string')
  })
})

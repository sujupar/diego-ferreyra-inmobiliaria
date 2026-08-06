import { describe, it, expect } from 'vitest'
import { parsePortalLink } from './portal-link'

describe('parsePortalLink', () => {
  it('extrae el id de un link real de ZonaProp', () => {
    expect(parsePortalLink('https://www.zonaprop.com.ar/propiedades/clasificado/veclphin-venta-ph-4-ambientes-al-frente-con-patio-terraza-y-59439609.html'))
      .toEqual({ portal: 'zonaprop', externalId: '59439609' })
  })

  it('tolera parámetros de tracking al final del link de ZonaProp', () => {
    expect(parsePortalLink('https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-depto-2-amb-58990213.html?n_src=Listado&n_pos=17'))
      .toEqual({ portal: 'zonaprop', externalId: '58990213' })
  })

  it('extrae el id de un link real de Argenprop', () => {
    expect(parsePortalLink('https://www.argenprop.com/departamento-en-venta-en-palermo--18191220'))
      .toEqual({ portal: 'argenprop', externalId: '18191220' })
  })

  it('tolera espacios alrededor (pegado desde el navegador)', () => {
    expect(parsePortalLink('  https://www.zonaprop.com.ar/propiedades/clasificado/x-59072999.html  '))
      .toEqual({ portal: 'zonaprop', externalId: '59072999' })
  })

  it('acepta el link sin https:// (algunos navegadores lo ocultan al copiar)', () => {
    expect(parsePortalLink('www.zonaprop.com.ar/propiedades/clasificado/x-59341760.html'))
      .toEqual({ portal: 'zonaprop', externalId: '59341760' })
  })

  it('devuelve null para un link de otro sitio', () => {
    expect(parsePortalLink('https://www.mercadolibre.com.ar/MLA-1234567890')).toBeNull()
  })

  it('devuelve null si el link del portal no tiene id numérico', () => {
    expect(parsePortalLink('https://www.zonaprop.com.ar/inmobiliarias/diego-ferreyra.html')).toBeNull()
  })

  it('devuelve null para texto suelto, vacío o nulo', () => {
    expect(parsePortalLink('el aviso de la casa de belgrano')).toBeNull()
    expect(parsePortalLink('')).toBeNull()
    expect(parsePortalLink(null)).toBeNull()
    expect(parsePortalLink(undefined)).toBeNull()
  })

  it('ignora números cortos que no son ids de aviso', () => {
    expect(parsePortalLink('https://www.zonaprop.com.ar/propiedades/clasificado/casa-2-ambientes-123.html')).toBeNull()
  })
})

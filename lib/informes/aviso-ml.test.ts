import { describe, it, expect } from 'vitest'
import { idDeAvisoMercadoLibre } from './aviso-ml'

describe('idDeAvisoMercadoLibre (lo que pega Paula)', () => {
  it('el código solo, con o sin guión, en mayúsculas o no', () => {
    expect(idDeAvisoMercadoLibre('MLA3968141346')).toBe('MLA3968141346')
    expect(idDeAvisoMercadoLibre(' mla-3968141346 ')).toBe('MLA3968141346')
  })
  it('los links de los avisos de inmuebles', () => {
    expect(idDeAvisoMercadoLibre('https://casa.mercadolibre.com.ar/MLA-2113175611-venta-casa-coghlan-_JM')).toBe('MLA2113175611')
    expect(idDeAvisoMercadoLibre('inmueble.mercadolibre.com.ar/MLA-1234567890-depto?utm=1#x')).toBe('MLA1234567890')
    expect(idDeAvisoMercadoLibre('https://articulo.mercadolibre.com.ar/MLA-1234567890-algo')).toBe('MLA1234567890')
  })
  it('lo que no es un aviso de ML argentino → null', () => {
    expect(idDeAvisoMercadoLibre('https://www.zonaprop.com.ar/propiedades/x-59831729.html')).toBeNull()
    expect(idDeAvisoMercadoLibre('MLB1234567890')).toBeNull()
    expect(idDeAvisoMercadoLibre('MLA12')).toBeNull()
    expect(idDeAvisoMercadoLibre('')).toBeNull()
    expect(idDeAvisoMercadoLibre(null)).toBeNull()
  })
})

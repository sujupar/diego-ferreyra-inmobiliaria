import { describe, it, expect } from 'vitest'
import { combinarAvisos, idDeAvisoMercadoLibre, mismaDireccion } from './aviso-ml'

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

describe('mismaDireccion (aviso de la cuenta de ML ↔ propiedad), con pares reales de la cuenta', () => {
  it('misma calle y altura aunque cambien el formato, las tildes y el agregado de barrio', () => {
    expect(mismaDireccion('MOLDES 2112 7* PISO', 'Moldes 2112')).toBe(true)
    expect(mismaDireccion('Rocha N.° 1756/1758', 'Rocha N.° 1756/1758, Barracas, CABA')).toBe(true)
    expect(mismaDireccion('Av. Hipolito Yrigoyen 1550', 'Av. Hipolito Yrigoyen 1550, Monserrat, C')).toBe(true)
    expect(mismaDireccion('Álvarez Jonte 4300, Monte Castro', 'Calle Alvarez Jonte 4314')).toBe(false)
    expect(mismaDireccion('Tte. Gral. Juan D. Perón 4227-13 "B"', 'Tte. Gral. Juan Domingo Perón 4227')).toBe(true)
    expect(mismaDireccion('Diaz Velez 3841', 'Diaz Velez 3841, Almagro, CABA')).toBe(true)
  })
  it('la tilde en forma descompuesta (NFD, como la copia macOS) no cambia el resultado', () => {
    expect(mismaDireccion('José Luis Cantilo 4300', 'José Luis Cantilo 4300')).toBe(true)
  })
  it('otra altura u otra calle no es la misma', () => {
    expect(mismaDireccion('Gabriela Mistral 2750', 'Gabriela Mistral 2751, Villa Pueyrredon')).toBe(false)
    expect(mismaDireccion('Gabriela Mistral 4200', 'Gabriela Mistral 2751')).toBe(false)
    expect(mismaDireccion('Paraguay 3682', 'Tarija 3682')).toBe(false)
  })
  it('sin altura no se empareja (sería adivinar)', () => {
    expect(mismaDireccion('Lares de Canning', 'RP52 km 8,5, Canning')).toBe(false)
    expect(mismaDireccion('', 'Moldes 2112')).toBe(false)
  })
})

describe('combinarAvisos', () => {
  it('une plataforma, cuenta y el agregado a mano sin repetir, y saca los excluidos', () => {
    expect(combinarAvisos({
      plataforma: ['MLA2185347399'],
      cuenta: [{ id: 'MLA4071627624', titulo: 'Departamento 3 Ambientes', url: 'https://x/1' }, { id: 'MLA2185347399', titulo: 'Depto', url: 'https://x/2' }],
      manual: 'MLA1111111111',
      excluidos: ['MLA1111111111'],
    })).toEqual([
      { id: 'MLA2185347399', titulo: 'Depto', url: 'https://x/2', origen: 'plataforma' },
      { id: 'MLA4071627624', titulo: 'Departamento 3 Ambientes', url: 'https://x/1', origen: 'cuenta' },
    ])
  })
  it('el agregado a mano entra con su origen', () => {
    expect(combinarAvisos({ plataforma: [], cuenta: [], manual: 'MLA1111111111', excluidos: [] }))
      .toEqual([{ id: 'MLA1111111111', titulo: null, url: null, origen: 'manual' }])
  })
  it('tope de 5 avisos (cada uno son pedidos a una API con cupo)', () => {
    const cuenta = Array.from({ length: 8 }, (_, i) => ({ id: `MLA100000000${i}`, titulo: null, url: null }))
    expect(combinarAvisos({ plataforma: [], cuenta, manual: null, excluidos: [] })).toHaveLength(5)
  })
})

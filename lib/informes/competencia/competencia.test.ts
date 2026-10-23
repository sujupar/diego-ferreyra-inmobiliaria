import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { esLinkDelPortal, parsearListadoArgenprop, parsearListadoMercadoLibre } from './listados'
import { slugDeBarrio, urlBusquedaArgenprop, urlBusquedaMercadoLibre } from './busqueda'
import { ordenarCandidatas, type AvisoDeListado } from './puntaje'
import { normalizarDisposicion, normalizarEstado } from './caracteristicas'

const fixture = (n: string) => readFileSync(path.join(__dirname, '__fixtures__', n), 'utf8')

describe('parsearListadoArgenprop (listado real de Coghlan, 3 ambientes)', () => {
  const avisos = parsearListadoArgenprop(fixture('argenprop-listado.html'))
  it('lee cada tarjeta con link, dirección, precio, m², ambientes, dormitorios, baños, antigüedad, vistas y foto', () => {
    expect(avisos.length).toBeGreaterThanOrEqual(6)
    expect(avisos[0]).toMatchObject({
      portal: 'argenprop', url: 'https://www.argenprop.com/departamento-en-venta-en-coghlan-3-ambientes--20258532',
      direccion: 'Roque Pérez 2500, Piso 9, Coghlan', precio: 220000, moneda: 'USD', m2: 60, ambientes: 3, dormitorios: 2,
      banos: 1, antiguedad: 2, vistas: 2210, inmobiliaria: 'CORONEL FERNÁNDEZ REAL ESTATE',
    })
    expect(avisos[0].foto).toMatch(/^https:\/\/www\.argenprop\.com\/static-content\//)
  })
  it('una página sin tarjetas (cambió el HTML del portal) es un error, no una lista vacía', () => {
    expect(() => parsearListadoArgenprop('<html><body>nada</body></html>')).toThrow(/no reconoce/)
  })
})

describe('parsearListadoMercadoLibre (listado real de Coghlan, 3 ambientes)', () => {
  const avisos = parsearListadoMercadoLibre(fixture('mercadolibre-listado.html'))
  it('descarta emprendimientos en pozo ("Desde", "1 a 4 ambs.")', () => {
    expect(avisos.some(a => /pozo|Hills Freire/i.test(a.titulo ?? ''))).toBe(false)
  })
  it('lee precio, ambientes, baños, m², dirección, inmobiliaria, link y foto', () => {
    const casa = avisos.find(a => a.url.includes('MLA-2032308367'))
    expect(casa).toMatchObject({
      portal: 'mercadolibre', precio: 390000, moneda: 'USD', ambientes: 3, banos: 2, m2: 136,
      direccion: 'Romulo Naon Al 2800, Coghlan, Capital Federal', inmobiliaria: 'Martin Pinus',
    })
    expect(casa?.url).toBe('https://departamento.mercadolibre.com.ar/MLA-2032308367-venta-departamento-tipo-casa-3-amb-con-terraza-y-cochera-en-coghlan-_JM')
    expect(casa?.foto).toMatch(/^https:\/\/http2\.mlstatic\.com\//)
  })
  it('una página sin tarjetas es un error', () => {
    expect(() => parsearListadoMercadoLibre('<html></html>')).toThrow(/no reconoce/)
  })
})

describe('normalizar disposición y estado (cada portal los escribe distinto)', () => {
  it('disposición', () => {
    expect(normalizarDisposicion('Contrafrente')).toBe('contrafrente')
    expect(normalizarDisposicion({ value_id: 'LATERAL' })).toBe('lateral')
    expect(normalizarDisposicion({ value_name: 'Frente' })).toBe('frente')
    expect(normalizarDisposicion('Interno')).toBe('interno')
    expect(normalizarDisposicion('cualquier cosa')).toBeNull()
    expect(normalizarDisposicion(null)).toBeNull()
  })
  it('estado', () => {
    expect(normalizarEstado('MUY_BUENO')).toBe('muy bueno')
    expect(normalizarEstado({ value_id: 'EXCELENTE' })).toBe('excelente')
    expect(normalizarEstado('A estrenar')).toBe('a estrenar')
    expect(normalizarEstado('Reciclado')).toBe('reciclado')
    expect(normalizarEstado('A refaccionar')).toBe('a refaccionar')
    expect(normalizarEstado('Bueno')).toBe('bueno')
    expect(normalizarEstado('')).toBeNull()
  })
})

describe('búsqueda por barrio', () => {
  it('slug del barrio sin tildes (también en forma NFD)', () => {
    expect(slugDeBarrio('Villa Pueyrredón')).toBe('villa-pueyrredon')
    expect(slugDeBarrio('Nuñez')).toBe('nunez')
  })
  it('Argenprop: tipo, barrio y ambientes (formato verificado contra el portal)', () => {
    expect(urlBusquedaArgenprop({ tipo: 'departamento', barrio: 'Coghlan', ambientes: 3 }))
      .toBe('https://www.argenprop.com/departamentos/venta/coghlan/3-ambientes')
    expect(urlBusquedaArgenprop({ tipo: 'casa', barrio: 'Villa Devoto', ambientes: null })).toBe('https://www.argenprop.com/casas/venta/villa-devoto')
    expect(urlBusquedaArgenprop({ tipo: 'cochera', barrio: 'Coghlan', ambientes: 1 })).toBeNull()
    expect(urlBusquedaArgenprop({ tipo: 'departamento', barrio: null, ambientes: 3 })).toBeNull()
  })
  it('MercadoLibre: solo Capital (su ruta de provincia no se puede armar del barrio)', () => {
    expect(urlBusquedaMercadoLibre({ tipo: 'departamento', barrio: 'Coghlan', ambientes: 3, esCapital: true }))
      .toBe('https://inmuebles.mercadolibre.com.ar/departamentos/venta/3-ambientes/capital-federal/coghlan/')
    expect(urlBusquedaMercadoLibre({ tipo: 'departamento', barrio: 'Villa Ballester', ambientes: 3, esCapital: false })).toBeNull()
  })
})

describe('ordenarCandidatas', () => {
  const ref = { direccion: 'Roque Pérez 3059', ambientes: 3, m2: 70, precio: 200000, antiguedad: 10 }
  const aviso = (o: Partial<AvisoDeListado>): AvisoDeListado => ({
    portal: 'argenprop', url: `https://x/${Math.random()}`, titulo: null, direccion: 'Calle 100', precio: 200000, moneda: 'USD', m2: 70,
    ambientes: 3, dormitorios: 2, banos: 1, cocheras: null, antiguedad: 10, foto: 'https://f', vistas: null, inmobiliaria: null, ...o,
  })
  it('ordena por parecido y explica el porqué', () => {
    const r = ordenarCandidatas(ref, [aviso({ direccion: 'Lejos 1', ambientes: 5, m2: 200, precio: 600000 }), aviso({ direccion: 'Cerca 1' })])
    expect(r[0].direccion).toBe('Cerca 1')
    expect(r[0].porque).toEqual(['mismos ambientes', 'm² parecidos', 'precio parecido', 'antigüedad parecida'])
    expect(r[0].puntaje).toBeGreaterThan(r[1].puntaje)
  })
  it('saca nuestra propia propiedad y los avisos repetidos entre portales (misma dirección y precio)', () => {
    const r = ordenarCandidatas(ref, [
      aviso({ direccion: 'Roque Pérez 3059, Coghlan' }),
      aviso({ direccion: 'Quesada 3250, Coghlan', portal: 'argenprop' }),
      aviso({ direccion: 'Quesada 3250', portal: 'mercadolibre' }),
    ])
    expect(r.map(c => c.direccion)).toEqual(['Quesada 3250, Coghlan'])
  })
  it('sin precio o sin m² no se puede comparar el valor del m²: quedan, pero al final', () => {
    const r = ordenarCandidatas(ref, [aviso({ direccion: 'Sin precio 1', precio: null }), aviso({ direccion: 'Completa 1' })])
    expect(r.map(c => c.direccion)).toEqual(['Completa 1', 'Sin precio 1'])
  })
  it('con el aviso abierto, suma lo leído (disposición, estado, antigüedad) y premia si coincide con la nuestra', () => {
    const conDisp = { ...ref, disposicion: 'frente' as const, estado: 'muy bueno' as const }
    const a = aviso({ direccion: 'Contrafrente 1', url: 'https://a' })
    const b = aviso({ direccion: 'Frente 1', url: 'https://b', antiguedad: null })
    const r = ordenarCandidatas(conDisp, [a, b], {
      'https://a': { disposicion: 'contrafrente', estado: 'bueno', orientacion: null, vistas: null, publicadoHace: null, antiguedad: null, cocheras: null },
      'https://b': { disposicion: 'Frente', estado: 'Muy bueno', orientacion: 'Norte', vistas: 300, publicadoHace: 'Publicado hace 3 días', antiguedad: 12, cocheras: 1 },
    })
    expect(r[0].direccion).toBe('Frente 1')
    expect(r[0]).toMatchObject({ disposicion: 'frente', estado: 'muy bueno', antiguedad: 12, cocheras: 1, vistas: 300, abierta: true })
    expect(r[0].porque).toEqual(expect.arrayContaining(['también al frente', 'mismo estado (muy bueno)']))
  })
  it('tope de 12 candidatas', () => {
    expect(ordenarCandidatas(ref, Array.from({ length: 20 }, (_, i) => aviso({ direccion: `Calle ${i + 1}00` })))).toHaveLength(12)
  })
})

describe('esLinkDelPortal (el link de una candidata va a la pantalla, al PDF y al scraper)', () => {
  it('acepta los avisos de cada portal con https y host exacto', () => {
    expect(esLinkDelPortal('argenprop', 'https://www.argenprop.com/departamento-en-venta-en-coghlan--1234')).toBe(true)
    expect(esLinkDelPortal('mercadolibre', 'https://departamento.mercadolibre.com.ar/MLA-123456789-x')).toBe(true)
    expect(esLinkDelPortal('mercadolibre', 'https://mercadolibre.com.ar/MLA-1')).toBe(true)
  })

  it('rechaza otro protocolo, otro host o un host que solo CONTIENE el del portal', () => {
    expect(esLinkDelPortal('argenprop', 'http://www.argenprop.com/x--1')).toBe(false)
    expect(esLinkDelPortal('argenprop', 'javascript:alert(1)//--1')).toBe(false)
    expect(esLinkDelPortal('argenprop', 'https://evil.com/argenprop.com--1')).toBe(false)
    expect(esLinkDelPortal('argenprop', 'https://www.argenprop.com.evil.com/x--1')).toBe(false)
    expect(esLinkDelPortal('mercadolibre', 'https://evilmercadolibre.com.ar/MLA-1')).toBe(false)
    expect(esLinkDelPortal('mercadolibre', 'https://mercadolibre.com.ar.evil.com/MLA-1')).toBe(false)
    expect(esLinkDelPortal('mercadolibre', 'no es una url MLA')).toBe(false)
  })

  it('rechaza un link más largo de lo que acepta una competidora', () => {
    expect(esLinkDelPortal('argenprop', `https://www.argenprop.com/${'a'.repeat(1000)}--1`)).toBe(false)
  })

  it('un aviso con link ajeno en el listado se descarta, el resto queda', () => {
    const ap = readFileSync(path.join(__dirname, '__fixtures__/argenprop-listado.html'), 'utf8')
    const hostil = ap.replace(/href="\/([^"]*--\d+)"/, 'href="https://evil.com/$1"')
    expect(hostil).not.toBe(ap)
    const avisos = parsearListadoArgenprop(hostil)
    expect(avisos.length).toBe(parsearListadoArgenprop(ap).length - 1)
    expect(avisos.every(a => a.url.startsWith('https://www.argenprop.com/'))).toBe(true)
  })
})

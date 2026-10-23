import { describe, expect, it } from 'vitest'
import { competidoraDesdeAviso, esAvisoDelScraper, fuentesPorTraer, numeroDelCampo, resumenDeLaFuente, rotuloDeLaFuente, separarUbicacion } from './editor'
import type { Fuentes } from './tipos'
import { sanearCambios } from './sanear'

const aviso = {
  url: 'https://www.zonaprop.com.ar/propiedades/x-123.html',
  title: 'Casa en Coghlan',
  price: 695000,
  currency: 'USD' as const,
  location: 'Quesada 3250, Coghlan, Capital Federal',
  description: '',
  features: {
    bedrooms: 5, bathrooms: 4, coveredArea: 300, uncoveredArea: null, totalArea: 436, age: 50, floor: null,
    totalFloors: null, expenses: null, orientation: null, disposal: null, condition: null, rooms: 6, garages: 3,
    views: 346, publishedDate: 'Publicado hace 84 días',
  },
  images: ['https://img.zonaprop.com.ar/1.jpg', 'https://img.zonaprop.com.ar/2.jpg'],
  portal: 'zonaprop',
}

describe('competidoraDesdeAviso', () => {
  it('completa todos los datos del aviso y propone el valor del m² sobre la superficie total', () => {
    const c = competidoraDesdeAviso('https://www.zonaprop.com.ar/propiedades/x-123.html', aviso)
    expect(c).toEqual({
      url: 'https://www.zonaprop.com.ar/propiedades/x-123.html', direccion: 'Quesada 3250', barrio: 'Coghlan',
      precio: 695000, moneda: 'USD', m2: 436, valorM2: 1594, ambientes: 6, banos: 4, dormitorios: 5,
      antiguedad: 50, cocheras: 3, foto: 'https://img.zonaprop.com.ar/1.jpg', publicadoHace: 'Publicado hace 84 días',
      visualizaciones: 346, bajoDePrecio: false,
    })
  })

  it('sin superficie total usa la cubierta', () => {
    const c = competidoraDesdeAviso(aviso.url, { ...aviso, features: { ...aviso.features, totalArea: null } })
    expect(c.m2).toBe(300)
  })

  it('lo que el portal no muestra queda vacío (para completar a mano), nunca en 0', () => {
    const c = competidoraDesdeAviso(aviso.url, {
      ...aviso, price: null, currency: null, images: [],
      features: { ...aviso.features, rooms: undefined, garages: undefined, views: undefined, publishedDate: undefined, age: null },
    })
    expect(c).toMatchObject({ precio: null, moneda: null, valorM2: null, ambientes: null, cocheras: null, foto: null, antiguedad: null, visualizaciones: null, publicadoHace: null })
  })

  it('descarta una foto que no es https (va a un <img> y al PDF)', () => {
    expect(competidoraDesdeAviso(aviso.url, { ...aviso, images: ['http://x.com/a.jpg', 'data:image/png;base64,AA'] }).foto).toBeNull()
  })

  it('lo que trae el portal siempre se puede guardar: textos recortados a los topes del servidor, números absurdos vacíos', () => {
    const c = competidoraDesdeAviso(aviso.url, {
      ...aviso, location: '', title: 'x'.repeat(300), price: 5_000_000_000,
      features: { ...aviso.features, publishedDate: 'p'.repeat(200) },
    })
    expect(c.direccion).toHaveLength(200)
    expect(c.precio).toBeNull()
    expect(c.publicadoHace).toHaveLength(80)
    expect(sanearCambios({ competidoras: [c] }).ok).toBe(true)
  })

  it('sin ubicación usa el título como dirección', () => {
    expect(competidoraDesdeAviso(aviso.url, { ...aviso, location: '' }).direccion).toBe('Casa en Coghlan')
  })
})

describe('separarUbicacion', () => {
  it('separa dirección y barrio', () => {
    expect(separarUbicacion('Quesada 3250, Coghlan, Capital Federal')).toEqual({ direccion: 'Quesada 3250', barrio: 'Coghlan' })
  })
  it('una ubicación de una sola parte es la dirección', () => {
    expect(separarUbicacion('Zapiola 3000')).toEqual({ direccion: 'Zapiola 3000', barrio: null })
  })
  it('vacía', () => {
    expect(separarUbicacion('  ')).toEqual({ direccion: '', barrio: null })
  })
})

describe('rotuloDeLaFuente', () => {
  it('cada estado tiene su texto; un error nunca se muestra como cero', () => {
    expect(rotuloDeLaFuente(undefined)).toEqual({ texto: 'Por traer', tono: 'pendiente' })
    expect(rotuloDeLaFuente({ estado: 'pendiente', actualizadoEn: null, datos: null, error: null }).tono).toBe('pendiente')
    expect(rotuloDeLaFuente({ estado: 'ok', actualizadoEn: 'x', datos: {}, error: null })).toEqual({ texto: 'Traído', tono: 'ok' })
    expect(rotuloDeLaFuente({ estado: 'sin_datos', actualizadoEn: 'x', datos: null, error: 'No hay campaña' })).toEqual({ texto: 'No hay campaña', tono: 'neutro' })
    expect(rotuloDeLaFuente({ estado: 'error', actualizadoEn: 'x', datos: null, error: 'Meta no respondió' })).toEqual({ texto: 'No se pudo traer: Meta no respondió', tono: 'error' })
  })
})

describe('fuentesPorTraer', () => {
  it('devuelve las pendientes y las que faltan, en el orden de FUENTES', () => {
    const f: Fuentes = {
      consultas: { estado: 'ok', actualizadoEn: 'x', datos: null, error: null },
      visitas: { estado: 'pendiente', actualizadoEn: null, datos: null, error: null },
      meta: { estado: 'error', actualizadoEn: 'x', datos: null, error: 'x' },
    }
    expect(fuentesPorTraer(f)).toEqual(['visitas', 'reserva', 'mercadolibre', 'instagram'])
  })
})

describe('esAvisoDelScraper', () => {
  it('acepta la forma que devuelve el scraper', () => {
    expect(esAvisoDelScraper(aviso)).toBe(true)
  })
  it('rechaza un cuerpo de error o una forma incompleta', () => {
    expect(esAvisoDelScraper(null)).toBe(false)
    expect(esAvisoDelScraper({ error: 'Failed to scrape property' })).toBe(false)
    expect(esAvisoDelScraper({ ...aviso, images: undefined })).toBe(false)
    expect(esAvisoDelScraper({ ...aviso, features: null })).toBe(false)
    expect(esAvisoDelScraper({ ...aviso, location: 3 })).toBe(false)
  })
})

describe('numeroDelCampo', () => {
  it('lee los puntos de miles como los escribe una persona', () => {
    expect(numeroDelCampo('1.055')).toBe(1055)
    expect(numeroDelCampo(' 930 ')).toBe(930)
    expect(numeroDelCampo('US$ 695.000')).toBe(695000)
  })
  it('vacío o sin dígitos queda vacío, nunca 0', () => {
    expect(numeroDelCampo('')).toBeUndefined()
    expect(numeroDelCampo('   ')).toBeUndefined()
    expect(numeroDelCampo('abc')).toBeUndefined()
  })
  it('el cero escrito es cero', () => {
    expect(numeroDelCampo('0')).toBe(0)
  })
})

describe('resumenDeLaFuente', () => {
  const ok = <T,>(datos: T) => ({ estado: 'ok' as const, actualizadoEn: 'x', datos, error: null })
  it('consultas con el desglose de los portales que tuvieron', () => {
    const f: Fuentes = { consultas: ok({ total: 9, porPortal: { zonaprop: 3, argenprop: 0, mercadolibre: 0, redes: 6, otros: 0 } }) }
    expect(resumenDeLaFuente('consultas', f)).toBe('9 consultas (Zonaprop 3, Redes 6)')
  })
  it('una sola consulta en singular', () => {
    const f: Fuentes = { consultas: ok({ total: 1, porPortal: { zonaprop: 0, argenprop: 1, mercadolibre: 0, redes: 0, otros: 0 } }) }
    expect(resumenDeLaFuente('consultas', f)).toBe('1 consulta (Argenprop 1)')
  })
  it('visitas y fichas', () => {
    const f: Fuentes = { visitas: ok({ realizadas: 2, ficha: { respuestas: 1, leGusto: { si: 1, no: 0 }, precio: { correcto: 1, alto: 0, bajo: 0 }, ofertas: [], moneda: null, menosGusto: [], masGusto: [], comentariosMenosGusto: [] } }) }
    expect(resumenDeLaFuente('visitas', f)).toBe('2 visitas realizadas · 1 ficha completa')
  })
  it('reserva', () => {
    expect(resumenDeLaFuente('reserva', { reserva: ok({ reservada: false, fecha: null }) })).toBe('Sin reserva en el período')
    expect(resumenDeLaFuente('reserva', { reserva: ok({ reservada: true, fecha: '2026-10-03' }) })).toBe('Reservada')
  })
  it('MercadoLibre, Meta e Instagram (este último rotulado como acumulado)', () => {
    expect(resumenDeLaFuente('mercadolibre', { mercadolibre: ok({ avisos: [{ id: 'MLA123', titulo: null, url: null, origen: 'plataforma' as const }], visitas: 1234 }) })).toBe('1.234 visitas al aviso MLA123')
    expect(resumenDeLaFuente('mercadolibre', { mercadolibre: ok({
      avisos: [{ id: 'MLA123', titulo: null, url: null, origen: 'plataforma' as const }], visitas: 15, vistasTelefono: 2,
      contactos: { interesados: 3, preguntas: 2, whatsapp: 1, llamadas: 0, otros: 0 },
    }) })).toBe('15 visitas al aviso MLA123 · 3 interesados (2 preguntas, 1 WhatsApp) · vieron el teléfono 2 veces')
    expect(resumenDeLaFuente('mercadolibre', { mercadolibre: ok({
      avisos: [{ id: 'MLA1', titulo: null, url: null, origen: 'plataforma' as const }, { id: 'MLA2', titulo: null, url: null, origen: 'cuenta' as const }],
      visitas: 20,
    }) })).toBe('20 visitas en 2 avisos')
    expect(resumenDeLaFuente('meta', { meta: ok({ campanas: 1, alcance: 4910, impresiones: 7516, resultados: 5, gasto: 0, edadSexo: [], plataformas: [] }) }))
      .toBe('1 campaña · alcance 4.910 · 5 clientes potenciales')
    expect(resumenDeLaFuente('instagram', { instagram: ok({ reels: [{ permalink: null, publicadoEn: null, reproducciones: 1500, alcance: 900, meGusta: 1, comentarios: 0, guardados: 0, compartidos: 0 }] }) }))
      .toBe('1 reel · 1.500 reproducciones (acumulado desde que se publicó)')
  })
  it('sin datos u error no inventa números', () => {
    expect(resumenDeLaFuente('meta', {})).toBeNull()
    expect(resumenDeLaFuente('meta', { meta: { estado: 'error', actualizadoEn: 'x', datos: null, error: 'x' } })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { consolidarCampanias, porCampania, type FilaCampania } from './anuncios'
import { detalleOrigen, registrosPorPropiedad, type LeadRow } from './comercial'
import type { MetaDia } from '../panel/embudo'

describe('porCampania en dólares', () => {
  it('cada campaña lleva su gasto en USD al blue de cada día', () => {
    const meta: MetaDia[] = [
      { fecha: '2026-11-01', campaniaId: 't', campania: 'Tasación', gasto: 15_000, impresiones: 0, clics: 0, visitasMeta: 0, registros: 1 },
      { fecha: '2026-11-02', campaniaId: 't', campania: 'Tasación', gasto: 16_000, impresiones: 0, clics: 0, visitasMeta: 0, registros: 1 },
    ]
    const [f] = porCampania(meta, { desde: '2026-11-01', hasta: '2026-11-02' }, new Map(), new Map(), d => (d === '2026-11-01' ? 1500 : 1600))
    expect(f).toMatchObject({ gasto: 31_000, gastoUsd: 20, costoPorRegistroUsd: 10 })
  })
})

describe('registros en propiedades: personas y de dónde vinieron', () => {
  const nov = { desde: '2026-11-01', hasta: '2026-11-30' }
  const l = (o: Partial<LeadRow>): LeadRow => ({ property_id: 'p', source: 'landing', utm: {}, created_at: '2026-11-05T12:00:00Z', suspected_bot: false, deleted_at: null, ...o })
  it('la misma persona dos veces (mismo email o teléfono) cuenta una persona', () => {
    const r = registrosPorPropiedad([
      l({ email: 'Ana@x.com', phone: null }), l({ email: 'ana@x.com ', phone: null }),
      l({ email: null, phone: '+54 9 11 5555-1234' }), l({ email: null, phone: '1155551234' }),
      l({ email: null, phone: null }),
    ], nov, new Map())
    expect(r.total).toBe(5)
    expect(r.personas).toBe(3)
    expect(r.porPropiedad[0].personas).toBe(3)
  })
  it('detalle del origen: nombre del anuncio, reel o sin dato del anuncio', () => {
    expect(detalleOrigen('landing', { utm_source: 'ig', utm_content: 'Ad 1 Reel' })).toBe('Anuncio «Ad 1 Reel»')
    expect(detalleOrigen('landing', { utm_source: 'fb', utm_content: '{{ad.id}}' })).toBe('Anuncio (sin dato del anuncio)')
    expect(detalleOrigen('landing', { fbclid: 'x' })).toBe('Anuncio (sin dato del anuncio)')
    expect(detalleOrigen('landing', { utm_source: 'instagram', utm_medium: 'reel', utm_content: 'reel_42661eee' })).toBe('Reel de Instagram')
    expect(detalleOrigen('visita:cartel', null)).toBe('Cartel en la visita')
    expect(detalleOrigen('landing', {})).toBe('Directo')
  })
  it('agrupa el detalle por propiedad, de mayor a menor', () => {
    const r = registrosPorPropiedad([
      l({ utm: { utm_source: 'ig', utm_content: 'Ad 1 Reel' } }), l({ utm: { utm_source: 'ig', utm_content: 'Ad 1 Reel' } }),
      l({ utm: { utm_source: 'fb', utm_content: 'Ad 3 Carrusel' } }),
    ], nov, new Map())
    expect(r.porPropiedad[0].detalle).toEqual([{ etiqueta: 'Anuncio «Ad 1 Reel»', cantidad: 2 }, { etiqueta: 'Anuncio «Ad 3 Carrusel»', cantidad: 1 }])
  })
})

describe('consolidarCampanias', () => {
  const f = (o: Partial<FilaCampania>): FilaCampania => ({ campaniaId: 'c', nombre: 'n', tipo: 'tasacion', propiedadId: null, gasto: 100, visitas: 10, registros: 2, fuenteRegistros: 'pixel', costoPorRegistro: 50, gastoUsd: 1, costoPorRegistroUsd: 0.5, ...o })
  it('dos campañas de tasación del mismo período son una fila', () => {
    const r = consolidarCampanias([f({ campaniaId: 'a' }), f({ campaniaId: 'b', gasto: 300, registros: 2, gastoUsd: 3 })])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ gasto: 400, registros: 4, costoPorRegistro: 100, gastoUsd: 4, costoPorRegistroUsd: 1 })
  })
  it('dos campañas de la misma propiedad no duplican los registros de la ficha', () => {
    const r = consolidarCampanias([f({ tipo: 'propiedad', propiedadId: 'p', campaniaId: 'a', registros: 3 }), f({ tipo: 'propiedad', propiedadId: 'p', campaniaId: 'b', registros: 3 })])
    expect(r[0]).toMatchObject({ gasto: 200, registros: 3 })
  })
})

import { describe, it, expect } from 'vitest'
import {
  readAttributionFromParams,
  attributionToDealColumns,
  hasMetaAttribution,
} from './attribution'

describe('readAttributionFromParams', () => {
  it('extrae utm_* y fb_*_id de la query', () => {
    const a = readAttributionFromParams(
      '?utm_source=fb&utm_medium=paid&utm_campaign=Captacion%20CABA&utm_content=Anuncio%201&utm_term=Conjunto%20A&fb_campaign_id=120&fb_adset_id=121&fb_ad_id=122&fb_placement=feed',
    )
    expect(a.utm_source).toBe('fb')
    expect(a.utm_campaign).toBe('Captacion CABA')
    expect(a.fb_campaign_id).toBe('120')
    expect(a.fb_ad_id).toBe('122')
    expect(a.fb_placement).toBe('feed')
  })

  it('visita directa sin params → vacío y sin señal Meta', () => {
    const a = readAttributionFromParams('')
    expect(a).toEqual({})
    expect(hasMetaAttribution(a)).toBe(false)
  })
})

describe('attributionToDealColumns', () => {
  it('mapea atribución a columnas meta_* del deal', () => {
    const cols = attributionToDealColumns({
      utm_source: 'fb',
      utm_campaign: 'Captacion CABA',
      utm_content: 'Anuncio 1',
      utm_term: 'Conjunto A',
      fb_campaign_id: '120',
      fb_adset_id: '121',
      fb_ad_id: '122',
      fb_placement: 'feed',
    })
    expect(cols.meta_campaign_id).toBe('120')
    expect(cols.meta_campaign_name).toBe('Captacion CABA')
    expect(cols.meta_adset_id).toBe('121')
    expect(cols.meta_adset_name).toBe('Conjunto A')
    expect(cols.meta_ad_id).toBe('122')
    expect(cols.meta_ad_name).toBe('Anuncio 1')
    expect(cols.meta_placement).toBe('feed')
    expect(cols.meta_site_source).toBe('fb')
    expect(cols.origin_metadata).toBeTruthy() // blob de respaldo
  })

  it('sin atribución → objeto vacío (no fuerza UPDATE)', () => {
    expect(attributionToDealColumns(null)).toEqual({})
    expect(attributionToDealColumns({})).toEqual({})
  })

  it('atribución parcial: setea lo presente, deja el resto null', () => {
    const cols = attributionToDealColumns({ utm_source: 'ig', fb_campaign_id: '999' })
    expect(cols.meta_site_source).toBe('ig')
    expect(cols.meta_campaign_id).toBe('999')
    expect(cols.meta_ad_name).toBeNull()
  })
})

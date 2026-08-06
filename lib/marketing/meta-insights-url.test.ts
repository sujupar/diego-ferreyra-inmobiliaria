import { describe, it, expect } from 'vitest'
import { buildDailyInsightsUrl } from './meta-ads'

describe('buildDailyInsightsUrl', () => {
  const url = buildDailyInsightsUrl('act_123', 'TOKEN', '2026-03-01', '2026-05-31')

  it('pide el desglose DIARIO — sin esto Meta devuelve un total del rango', () => {
    expect(url).toContain('time_increment=1')
  })

  it('pide date_start explícitamente, que es de donde sale la fecha de cada fila', () => {
    expect(decodeURIComponent(url)).toContain('date_start')
  })

  it('agrega a nivel campaña y usa el rango pedido', () => {
    const plano = decodeURIComponent(url)
    expect(plano).toContain('level=campaign')
    expect(plano).toContain('"since":"2026-03-01"')
    expect(plano).toContain('"until":"2026-05-31"')
  })

  it('incluye la cuenta, el token y los campos que la app necesita', () => {
    const plano = decodeURIComponent(url)
    expect(url).toContain('act_123/insights')
    expect(url).toContain('access_token=TOKEN')
    for (const campo of ['campaign_id', 'campaign_name', 'impressions', 'clicks', 'ctr', 'spend', 'actions']) {
      expect(plano).toContain(campo)
    }
  })
})

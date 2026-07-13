import { describe, it, expect, vi } from 'vitest'

// `property-inquiries.ts` importa `server-only` (no resuelve bajo vitest);
// mismo patrón que lib/funnel/create-funnel-lead.test.ts.
vi.mock('server-only', () => ({}))

import { rowsToSummary } from './property-inquiries'

describe('rowsToSummary', () => {
  it('mapea filas de la RPC al objeto summary (acepta value numérico o string)', () => {
    const rows = [
      { metric: 'total', value: 12 },
      { metric: 'matched', value: '9' },
      { metric: 'unidentified', value: 3 },
      { metric: 'mercadolibre', value: 5 },
      { metric: 'argenprop', value: 4 },
      { metric: 'zonaprop', value: 3 },
    ]
    expect(rowsToSummary(rows)).toEqual({ total: 12, matched: 9, unidentified: 3, mercadolibre: 5, argenprop: 4, zonaprop: 3 })
  })

  it('tolera null y métricas faltantes (todo en 0)', () => {
    expect(rowsToSummary(null)).toEqual({ total: 0, matched: 0, unidentified: 0, mercadolibre: 0, argenprop: 0, zonaprop: 0 })
    expect(rowsToSummary([{ metric: 'total', value: 7 }])).toEqual({ total: 7, matched: 0, unidentified: 0, mercadolibre: 0, argenprop: 0, zonaprop: 0 })
  })
})

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MetricsPage from './page'

/**
 * D36 y D10 — el tablero de Métricas.
 *
 * D36: las tarjetas "Embudo — eventos del período" y "Comparativa vs período
 * anterior" eran `funnel ? <grafico/> : <spinner/>`. Cuando el fetch fallaba,
 * `funnel` quedaba en null para siempre pero `loading` ya se había apagado: los
 * dos spinners giraban indefinidamente afirmando una carga que no existía, al
 * lado de un cartel rojo con el texto crudo `funnel: 401`.
 *
 * D10: la tarjeta "Estado actual del pipeline" decía "Mismos números si filtrás
 * por la misma fecha" que el CRM. Desde que el CRM corta el día en hora
 * argentina y estas RPC lo siguen cortando en UTC, eso es falso — 126 de 819
 * deals caen en un día distinto según el criterio. Las RPC no se tocan (moverlas
 * cambiaría cifras históricas), así que la pantalla dice con qué mide.
 */

// Los gráficos no aportan nada a estas reglas y arrastran recharts.
vi.mock('@/components/metrics/FunnelChart', () => ({ FunnelChart: () => <div>grafico-embudo</div> }))
vi.mock('@/components/metrics/MetricsTable', () => ({ MetricsTable: () => <div>tabla-comparativa</div> }))
vi.mock('@/components/metrics/CampaignBreakdown', () => ({ CampaignBreakdown: () => <div /> }))
vi.mock('@/components/metrics/FunnelByDayChart', () => ({ FunnelByDayChart: () => <div /> }))
vi.mock('@/components/metrics/CurrentStateBreakdown', () => ({ CurrentStateBreakdown: () => <div /> }))
vi.mock('@/components/metrics/PropertyInquiriesPanel', () => ({ PropertyInquiriesPanel: () => <div /> }))
vi.mock('@/components/metrics/SendTestReport', () => ({ SendTestReport: () => <div /> }))
vi.mock('@/components/metrics/EstadoResultadosEmbudo', () => ({ EstadoResultadosEmbudo: () => <div /> }))
vi.mock('@/components/metrics/CostosPanel', () => ({ CostosPanel: () => <div /> }))
vi.mock('@/components/metrics/CoberturaAsesoresPanel', () => ({ CoberturaAsesoresPanel: () => <div /> }))
vi.mock('@/components/metrics/DateRangePicker', () => ({ DateRangePicker: () => <div /> }))

let estadoDelEmbudo: { ok: boolean; status: number }
let pedidos: string[]

beforeEach(() => {
  estadoDelEmbudo = { ok: true, status: 200 }
  pedidos = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      pedidos.push(url)
      if (url.startsWith('/api/metrics/funnel?')) {
        return {
          ok: estadoDelEmbudo.ok,
          status: estadoDelEmbudo.status,
          json: async () => (estadoDelEmbudo.ok ? { current: {}, previous: {} } : { error: 'x' }),
        }
      }
      return { ok: true, status: 200, json: async () => [] }
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Métricas — una carga fallida no deja spinners girando', () => {
  it('ante un 500 las dos tarjetas dicen el motivo y ofrecen Reintentar, sin spinner', async () => {
    estadoDelEmbudo = { ok: false, status: 500 }
    render(<MetricsPage />)

    const motivos = await screen.findAllByText(/No se pudieron traer las métricas del embudo \(error 500\)/)
    // Una por tarjeta (Embudo y Comparativa) más el cartel rojo de arriba.
    expect(motivos.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: /Reintentar/ })).toHaveLength(2)
    expect(document.querySelectorAll('.animate-spin')).toHaveLength(0)
  })

  it('el 401 se dice en castellano, no como "funnel: 401"', async () => {
    estadoDelEmbudo = { ok: false, status: 401 }
    render(<MetricsPage />)

    expect((await screen.findAllByText('Se venció la sesión. Volvé a entrar.')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/funnel: 401/)).not.toBeInTheDocument()
  })

  it('"Reintentar" vuelve a pedir y, si esta vez sale bien, aparecen los gráficos', async () => {
    estadoDelEmbudo = { ok: false, status: 500 }
    render(<MetricsPage />)

    const botones = await screen.findAllByRole('button', { name: /Reintentar/ })
    estadoDelEmbudo = { ok: true, status: 200 }
    fireEvent.click(botones[0])

    expect(await screen.findByText('grafico-embudo')).toBeInTheDocument()
    expect(screen.getByText('tabla-comparativa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
  })

  it('con la carga OK no hay ni error ni Reintentar', async () => {
    render(<MetricsPage />)

    expect(await screen.findByText('grafico-embudo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
  })
})

describe('Métricas — el pipeline no afirma que coincide con el CRM', () => {
  it('la tarjeta explica que corta el día en UTC y el CRM en hora argentina', async () => {
    render(<MetricsPage />)

    expect(await screen.findByText(/corta el día en horario UTC/)).toBeInTheDocument()
    expect(screen.getByText(/hora argentina/)).toBeInTheDocument()
    expect(screen.getByText(/no siempre dan idénticos/)).toBeInTheDocument()
  })

  it('ya no promete "Mismos números si filtrás por la misma fecha"', async () => {
    render(<MetricsPage />)

    await screen.findByText('Estado actual del pipeline')
    expect(screen.queryByText(/Mismos números si filtrás por la misma fecha/)).not.toBeInTheDocument()
  })
})

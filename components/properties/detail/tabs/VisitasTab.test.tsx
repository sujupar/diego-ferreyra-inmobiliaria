// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { regaloMock } = vi.hoisted(() => ({ regaloMock: vi.fn((_props: { propertyId: string }) => null) }))
vi.mock('@/components/visitas/encuesta/RegaloDeLaEncuesta', () => ({ RegaloDeLaEncuesta: regaloMock }))

import { VisitasTab } from './VisitasTab'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const PROP = '33333333-3333-4333-8333-333333333333'
let respuestas: Array<{ status: number; body: unknown }> = []
const urls: string[] = []

beforeEach(() => {
  urls.length = 0
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0]
    return new Response(JSON.stringify(r?.body ?? {}), { status: r?.status ?? 500, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => { vi.useRealTimers() })

describe('VisitasTab', () => {
  it('pide las visitas de ESTA propiedad y las separa en próximas y pasadas, con link a cada ficha', async () => {
    const futura = v({ scheduled_at: '2026-10-20T13:00:00Z', client_name: 'Futura' })
    const pasada = v({ scheduled_at: '2026-10-01T13:00:00Z', client_name: 'Pasada', status: 'completed' })
    respuestas = [{ status: 200, body: { data: [futura, pasada], total: 2 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    expect(await screen.findByRole('heading', { name: 'Próximas (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pasadas (1)' })).toBeInTheDocument()
    expect(screen.getByText('Realizada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Futura/ })).toHaveAttribute('href', `/visits/${futura.id}`)
    expect(urls[0]).toBe(`/api/visits?propiedad=${PROP}&porPagina=200`)
  })
  it('sin visitas lo dice; "Qué opinan" dice que nadie respondió', async () => {
    respuestas = [{ status: 200, body: { data: [], total: 0 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    expect(await screen.findByText('Todavía no hay visitas en esta propiedad.')).toBeInTheDocument()
    expect(screen.getByText('Sin datos — todavía nadie respondió la encuesta')).toBeInTheDocument()
  })
  it('"Qué opinan" de ESTA propiedad con lo que respondieron', async () => {
    const enc = { sent_at: '2026-10-01T12:00:00Z', completed_at: '2026-10-01T13:00:00Z', expires_at: '2026-10-31T12:00:00Z', liked: true,
      price_opinion: 'correcto', offer_amount: null, offer_currency: null, offer_declined: true,
      most_liked_tags: ['luz'], least_liked_tags: ['nada'], most_liked_other: null, least_liked_other: null }
    respuestas = [{ status: 200, body: { data: [v({ scheduled_at: '2026-10-01T13:00:00Z', status: 'completed', encuesta: enc })], total: 1 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    expect(await screen.findByText('La luz (1)')).toBeInTheDocument()
  })
  it('si falla: el mensaje real y "Reintentar"', async () => {
    respuestas = [{ status: 500, body: { error: 'No pudimos cargar las visitas' } }, { status: 200, body: { data: [], total: 0 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    expect(await screen.findByText('No pudimos cargar las visitas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText('Todavía no hay visitas en esta propiedad.')).toBeInTheDocument())
  })
  it('monta la tarjeta del regalo de ESTA propiedad', async () => {
    respuestas = [{ status: 200, body: { data: [], total: 0 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    await screen.findByText('Todavía no hay visitas en esta propiedad.')
    expect(regaloMock.mock.calls[0][0]).toMatchObject({ propertyId: PROP })
  })
})

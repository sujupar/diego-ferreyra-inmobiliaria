// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { InformesTab } from './InformesTab'

const PROP = '33333333-3333-4333-8333-333333333333'
type Llamada = { url: string; init?: RequestInit }
let llamadas: Llamada[] = []
let respuestas: Array<{ status: number; body: unknown }> = []

beforeEach(() => {
  llamadas = []
  push.mockReset()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init })
    const r = respuestas.shift() ?? { status: 500, body: {} }
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }))
})

const listado = (informes: unknown[], atajos = { ultimaQuincena: { desde: '2026-10-01', hasta: '2026-10-15' }, cicloDeLaPropiedad: { desde: '2026-10-03', hasta: '2026-10-17' } }) =>
  ({ status: 200, body: { data: { informes, atajos } } })

describe('InformesTab', () => {
  it('lista los informes con su período y estado, cada uno con link a su pantalla', async () => {
    respuestas = [listado([
      { id: 'a', desde: '2026-10-01', hasta: '2026-10-15', origen: 'ciclo', estado: 'borrador', listoAt: null },
      { id: 'b', desde: '2026-09-16', hasta: '2026-09-30', origen: 'manual', estado: 'listo', listoAt: 'x' },
    ])]
    render(<InformesTab propertyId={PROP} />)
    const primero = await screen.findByRole('link', { name: /del 1 al 15 de octubre de 2026/ })
    expect(primero).toHaveAttribute('href', '/informes/a')
    expect(primero).toHaveTextContent('Para completar')
    expect(screen.getByRole('link', { name: /del 16 al 30 de septiembre/ })).toHaveTextContent('Listo')
    expect(llamadas[0].url).toBe(`/api/properties/${PROP}/informes`)
  })

  it('sin informes invita a armar el primero', async () => {
    respuestas = [listado([])]
    render(<InformesTab propertyId={PROP} />)
    expect(await screen.findByText(/Armá el primero/)).toBeInTheDocument()
  })

  it('"Nuevo informe" con la última quincena crea el informe y abre su pantalla', async () => {
    respuestas = [listado([]), { status: 201, body: { data: { id: 'nuevo', nuevo: true } } }]
    render(<InformesTab propertyId={PROP} />)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo informe/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Armar informe' }))
    expect(JSON.parse(String(llamadas[1].init?.body))).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' })
    expect(llamadas[1].init?.method).toBe('POST')
    expect(push).toHaveBeenCalledWith('/informes/nuevo')
  })

  it('con fechas elegidas manda esas fechas', async () => {
    respuestas = [listado([]), { status: 201, body: { data: { id: 'x', nuevo: true } } }]
    render(<InformesTab propertyId={PROP} />)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo informe/ }))
    await userEvent.click(screen.getByLabelText(/Elegir fechas/))
    expect(screen.getByRole('button', { name: 'Armar informe' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Desde'), '2026-08-16')
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-09-16')
    await userEvent.click(screen.getByRole('button', { name: 'Armar informe' }))
    expect(JSON.parse(String(llamadas[1].init?.body))).toEqual({ desde: '2026-08-16', hasta: '2026-09-16' })
  })

  it('un atajo que no aplica queda deshabilitado con el motivo', async () => {
    respuestas = [listado([], { ultimaQuincena: { desde: '2026-10-01', hasta: '2026-10-15' }, cicloDeLaPropiedad: null } as never)]
    render(<InformesTab propertyId={PROP} />)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo informe/ }))
    expect(screen.getByLabelText(/Ciclo de la propiedad/)).toBeDisabled()
    expect(screen.getByText('Todavía no cumplió 15 días captada')).toBeInTheDocument()
  })

  it('sin fecha de captación lo dice (no "no cumplió 15 días")', async () => {
    respuestas = [listado([], { ultimaQuincena: { desde: '2026-10-01', hasta: '2026-10-15' }, cicloDeLaPropiedad: null, sinFechaDeCaptacion: true } as never)]
    render(<InformesTab propertyId={PROP} />)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo informe/ }))
    expect(screen.getByText('La propiedad no tiene fecha de captación cargada')).toBeInTheDocument()
  })

  it('si el servidor rechaza las fechas, muestra su motivo y no navega', async () => {
    respuestas = [listado([]), { status: 400, body: { error: 'El informe no puede terminar en el futuro' } }]
    render(<InformesTab propertyId={PROP} />)
    await userEvent.click(await screen.findByRole('button', { name: /Nuevo informe/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Armar informe' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El informe no puede terminar en el futuro')
    expect(push).not.toHaveBeenCalled()
  })

  it('error al cargar: mensaje y Reintentar', async () => {
    respuestas = [{ status: 403, body: { error: 'Solo quien gestiona la propiedad puede ver sus informes' } }, listado([])]
    render(<InformesTab propertyId={PROP} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo quien gestiona')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/Armá el primero/)).toBeInTheDocument()
  })
})

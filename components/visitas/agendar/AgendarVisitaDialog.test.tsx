// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AgendarVisitaDialog } from './AgendarVisitaDialog'

const PROP = { id: '33333333-3333-4333-8333-333333333333', address: 'Doblas 248', neighborhood: 'Caballito', foto: null, assigned_to: '22222222-2222-4222-8222-222222222222', status: 'approved', commercial_status: 'disponible', asking_price: 220000, currency: 'USD' }
let rol = 'asesor'

beforeEach(() => {
  rol = 'asesor'
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })
    if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
    if (url.startsWith('/api/visits/propiedades')) return json([PROP])
    if (url.includes('/interesados')) return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
    if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
    if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
    return new Response('{}', { status: 404 })
  }))
})

describe('AgendarVisitaDialog', () => {
  it('desde la ficha arranca en "¿De dónde viene esta visita?"', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    expect(await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })).toBeInTheDocument()
  })
  it('no deja avanzar sin elegir y explica por qué', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Elegí de dónde viene la visita')).toBeInTheDocument()
  })
  it('consulta de portal → lista quienes consultaron', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    fireEvent.click(await screen.findByRole('button', { name: /Consulta de portal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Mariana López')).toBeInTheDocument()
  })
  it('un asesor no ve el paso "Asesor"', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })
    await waitFor(() => expect(screen.queryByText('Asesor', { selector: 'li *' })).not.toBeInTheDocument())
  })

  // Decisión del controlador (Tarea 16): el campo de teléfono de la persona
  // elegida en la lista aparece cuando ese teléfono NO es utilizable
  // (`!ultimos10Digitos`), no solo cuando es `null`. Un '123' de carga vieja
  // "cuenta" como truthy pero no identifica un teléfono argentino completo.
  it('persona de la lista con teléfono de menos de 10 dígitos igual pide completarlo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
      if (url.startsWith('/api/visits/propiedades')) return json([PROP])
      if (url.includes('/interesados')) {
        return json([{ clave: 'consulta:c2', tipo: 'consulta', id: 'c2', nombre: 'Juan Pérez', telefono: '123', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: false, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
      }
      if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
      if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
      return new Response('{}', { status: 404 })
    }))
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    fireEvent.click(await screen.findByRole('button', { name: /Consulta de portal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(await screen.findByRole('button', { name: /Juan Pérez/ }))
    expect(await screen.findByLabelText(/Teléfono de Juan Pérez/)).toBeInTheDocument()
  })
})

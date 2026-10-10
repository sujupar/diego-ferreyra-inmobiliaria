// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AgendarVisitaDialog } from './AgendarVisitaDialog'

/**
 * Revisión final, grupo F (criterio 25): la ventana de agendar en un celular de
 * 360 px. Se fijan CLASES porque esto no lo atrapa un test de comportamiento (la
 * confirmación visual va en el QA con capturas a 360/390 px):
 *
 *  1. En la lista de interesados, el aviso "Ya tiene visita …" (~230 px) no se
 *     achicaba y la fila mide ~248 px: el nombre quedaba aplastado. En celular el
 *     aviso va DEBAJO del nombre; desde `sm` vuelve a la derecha.
 *  2. El `max-md:pr-16` (lugar para la X de cerrar, que en celular mide 44 px)
 *     estaba en TODO el contenido y le comía 40 px a cada fila. La X pisa solo
 *     arriba: el margen va solo en el título del paso.
 */
const PROP = { id: '33333333-3333-4333-8333-333333333333', address: 'Doblas 248', neighborhood: 'Caballito', foto: null, assigned_to: '22222222-2222-4222-8222-222222222222', status: 'approved', commercial_status: 'disponible', asking_price: 220000, currency: 'USD' }
const NOMBRE_LARGO = 'María Florencia Fernández de la Cruz'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: 'asesor' }), { status: 200 })
    if (url.startsWith('/api/visits/propiedades')) return json([PROP])
    if (url.includes('/interesados')) {
      return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: NOMBRE_LARGO, telefono: '1158234521', email: null,
        detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true,
        visitaActiva: { id: 'v1', scheduled_at: '2026-10-12T14:00:00Z' } }])
    }
    if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
    if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
    return new Response('{}', { status: 404 })
  }))
})

async function abrirListaDeInteresados() {
  const usuario = userEvent.setup()
  render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
  await usuario.click(await screen.findByRole('button', { name: /Consulta de portal/ }))
  await usuario.click(screen.getByRole('button', { name: 'Siguiente' }))
  return screen.findByRole('button', { name: new RegExp(NOMBRE_LARGO) })
}

describe('AgendarVisitaDialog en celular — el aviso de la fila no tapa el nombre', () => {
  it('la fila apila nombre y aviso en celular y vuelve a fila desde sm', async () => {
    const fila = await abrirListaDeInteresados()
    expect(fila.className).toContain('flex-col')
    expect(fila.className).toContain('sm:flex-row')
  })
  it('el nombre puede partirse en vez de quedar aplastado', async () => {
    const fila = await abrirListaDeInteresados()
    const nombre = screen.getByText(NOMBRE_LARGO)
    expect(nombre.className).toContain('break-words')
    expect(nombre.closest('.min-w-0')).toBeTruthy()
    expect(fila.contains(nombre)).toBe(true)
  })
  it('el aviso "Ya tiene visita" no se niega a achicarse en celular (shrink-0 solo desde sm)', async () => {
    await abrirListaDeInteresados()
    const aviso = screen.getByText(/^Ya tiene visita/)
    const clases = aviso.className.split(/\s+/)
    expect(clases).not.toContain('shrink-0')
    expect(clases).toContain('sm:shrink-0')
  })
})

describe('AgendarVisitaDialog en celular — el lugar para la X va solo en el título', () => {
  it('el título del paso deja lugar a la X de cerrar', async () => {
    await abrirListaDeInteresados()
    expect(screen.getByRole('heading', { name: '¿Quién consultó?' }).className).toContain('max-md:pr-16')
  })
  it('el contenido del paso ya no lleva el margen derecho entero', async () => {
    await abrirListaDeInteresados()
    const titulo = screen.getByRole('heading', { name: '¿Quién consultó?' })
    // El contenedor que scrollea (el que tiene `overflow-y-auto`) es el que llevaba el margen.
    const contenido = titulo.closest('.overflow-y-auto') as HTMLElement
    expect(contenido).toBeTruthy()
    expect(contenido.className).not.toContain('max-md:pr-16')
  })
  it('todos los pasos usan el mismo título con lugar para la X', async () => {
    const usuario = userEvent.setup()
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    expect((await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })).className).toContain('max-md:pr-16')
    await usuario.click(screen.getByRole('button', { name: /Cartel en la propiedad/ }))
    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect((await screen.findByRole('heading', { name: '¿Quién viene?' })).className).toContain('max-md:pr-16')
  })
})

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { getNavSections } from '@/lib/nav/sections'

let rutaActual = '/properties'
vi.mock('next/navigation', () => ({ usePathname: () => rutaActual }))

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as unknown as typeof window.matchMedia
})

const montar = (role: Parameters<typeof getNavSections>[0]) =>
  render(
    <SidebarProvider>
      <AppSidebar groups={getNavSections(role)} logoUrl="/logo.png" />
    </SidebarProvider>,
  )

beforeEach(() => {
  rutaActual = '/properties'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ new: 7 }) }))
})

describe('AppSidebar', () => {
  it('dibuja los títulos de grupo como texto, no como botones', () => {
    montar('admin')
    expect(screen.getByText('Captación')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Captación' })).not.toBeInTheDocument()
  })

  it('marca la pantalla actual con aria-current', () => {
    rutaActual = '/crm'
    montar('admin')
    expect(screen.getByRole('link', { name: /CRM/ })).toHaveAttribute('aria-current', 'page')
  })

  it('una subruta también marca a su ítem del menú', () => {
    rutaActual = '/properties/abc-123'
    montar('admin')
    expect(screen.getByRole('link', { name: /Listado/ })).toHaveAttribute('aria-current', 'page')
  })

  it('el desplegable que contiene la pantalla actual arranca abierto', () => {
    rutaActual = '/properties/new'
    montar('admin')
    expect(screen.getByRole('button', { name: /Propiedades/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('el desplegable que NO contiene la pantalla actual arranca cerrado', () => {
    rutaActual = '/crm'
    montar('admin')
    expect(screen.getByRole('button', { name: /Propiedades/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('pide el contador del Inbox y lo anuncia con contexto', async () => {
    montar('admin')
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/leads/count'))
    expect(await screen.findByLabelText('7 sin leer')).toBeInTheDocument()
  })

  it('si el contador falla, el menú se dibuja igual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')))
    montar('admin')
    expect(screen.getByRole('link', { name: /Inbox/ })).toBeInTheDocument()
  })

  it('el abogado no pide el contador: no tiene Inbox', () => {
    montar('abogado')
    expect(fetch).not.toHaveBeenCalled()
  })
})

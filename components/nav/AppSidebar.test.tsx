// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

/** El mismo menú pero arrancando COLAPSADO, como cuando la cookie dice "false". */
const montarColapsado = (role: Parameters<typeof getNavSections>[0]) =>
  render(
    <SidebarProvider defaultOpen={false}>
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

  it('el ítem activo lleva las clases de marca (fondo/texto/barra), no el token de hover — guarda contra revertir a bg-sidebar-accent', () => {
    rutaActual = '/crm'
    montar('admin')
    const activo = screen.getByRole('link', { name: /CRM/ })
    expect(activo).toHaveAttribute('data-active', 'true')
    expect(activo.className).toContain('data-[active=true]:bg-brand-soft')
    expect(activo.className).toContain('data-[active=true]:text-brand')
    expect(activo.className).toContain('data-[active=true]:before:bg-brand')
    // El bug de la tarea 5: el activo usaba el MISMO token que el hover
    // (bg-sidebar-accent), así que pasar el mouse por cualquier ítem se veía
    // igual que el activo. Que no vuelva.
    expect(activo.className).not.toContain('data-[active=true]:bg-sidebar-accent')
  })

  it('el sub-ítem activo del riel expandido también lleva las clases de marca', () => {
    rutaActual = '/properties/new'
    montar('admin')
    const activo = screen.getByRole('link', { name: 'Nueva' })
    expect(activo).toHaveAttribute('data-active', 'true')
    expect(activo.className).toContain('data-[active=true]:bg-brand-soft')
    expect(activo.className).toContain('data-[active=true]:text-brand')
    expect(activo.className).not.toContain('data-[active=true]:bg-sidebar-accent')
  })

  it('una subruta también marca a su ítem del menú', () => {
    rutaActual = '/properties/abc-123'
    montar('admin')
    expect(screen.getByRole('link', { name: /Listado/ })).toHaveAttribute('aria-current', 'page')
  })

  it('en /properties/new, "Nueva" queda activo y su hermano "Listado" (que también matchea como prefijo) no', () => {
    rutaActual = '/properties/new'
    montar('admin')
    expect(screen.getByRole('link', { name: 'Nueva' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Listado' })).not.toHaveAttribute('aria-current')
  })

  it('en /properties/review, "Revisión legal" queda activo y "Listado" no', () => {
    rutaActual = '/properties/review'
    montar('admin')
    expect(screen.getByRole('link', { name: 'Revisión legal' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Listado' })).not.toHaveAttribute('aria-current')
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

  it('una navegación client-side hacia adentro del submenú lo fuerza a abrirse (no es solo defaultOpen)', () => {
    rutaActual = '/crm'
    const { rerender } = montar('admin')
    expect(screen.getByRole('button', { name: /Propiedades/ })).toHaveAttribute('aria-expanded', 'false')

    rutaActual = '/properties/new'
    rerender(
      <SidebarProvider>
        <AppSidebar groups={getNavSections('admin')} logoUrl="/logo.png" />
      </SidebarProvider>,
    )

    expect(screen.getByRole('button', { name: /Propiedades/ })).toHaveAttribute('aria-expanded', 'true')
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

  it('el menú es un landmark de navegación con nombre', () => {
    montar('admin')
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
  })
})

describe('AppSidebar colapsado (modo ícono)', () => {
  it('los sub-ítems de un desplegable siguen siendo alcanzables: se abren en un menú flotante', async () => {
    montarColapsado('admin')

    // Colapsado NO hay submenú desplegado (la primitiva lo esconde): el
    // disparador tiene que abrir un menú aparte, o esas rutas no existen.
    const disparador = screen.getByRole('button', { name: /Propiedades/ })
    expect(disparador).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.queryByRole('link', { name: 'Listado' })).not.toBeInTheDocument()

    fireEvent.keyDown(disparador, { key: 'Enter' })

    const listado = await screen.findByRole('menuitem', { name: 'Listado' })
    expect(listado).toHaveAttribute('href', '/properties')
    expect(await screen.findByRole('menuitem', { name: 'Nueva' })).toHaveAttribute('href', '/properties/new')
    expect(await screen.findByRole('menuitem', { name: 'Revisión legal' })).toHaveAttribute('href', '/properties/review')
  })

  it('dentro del flotante, el ítem de la pantalla actual queda marcado', async () => {
    rutaActual = '/properties/new'
    montarColapsado('admin')

    fireEvent.keyDown(screen.getByRole('button', { name: /Propiedades/ }), { key: 'Enter' })

    expect(await screen.findByRole('menuitem', { name: 'Nueva' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('menuitem', { name: 'Listado' })).not.toHaveAttribute('aria-current')
  })

  it('el disparador avisa que la pantalla actual vive adentro de ese desplegable', () => {
    rutaActual = '/properties/new'
    montarColapsado('admin')
    expect(screen.getByRole('button', { name: /Propiedades/ })).toHaveAttribute('data-active', 'true')
  })

  it('los ítems sueltos siguen funcionando igual', () => {
    rutaActual = '/crm'
    montarColapsado('admin')
    expect(screen.getByRole('link', { name: /CRM/ })).toHaveAttribute('aria-current', 'page')
  })

  it('el aviso del Inbox sobrevive al colapso (el número no entra, el punto sí)', async () => {
    montarColapsado('admin')
    expect(await screen.findByTestId('aviso-colapsado')).toBeInTheDocument()
    // El conteo completo sigue anunciado para lectores de pantalla.
    expect(await screen.findByLabelText('7 sin leer')).toBeInTheDocument()
  })

  it('sin leads nuevos no hay punto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ new: 0 }) }))
    montarColapsado('admin')
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('aviso-colapsado')).not.toBeInTheDocument()
  })
})

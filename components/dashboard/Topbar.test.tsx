// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Topbar } from './Topbar'
import { getNavSections } from '@/lib/nav/sections'

let rutaActual = '/crm'
let busquedaActual = ''
vi.mock('next/navigation', () => ({
  usePathname: () => rutaActual,
  useSearchParams: () => new URLSearchParams(busquedaActual),
}))

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as unknown as typeof window.matchMedia
})

const montar = () =>
  render(
    <SidebarProvider>
      <Topbar groups={getNavSections('admin')}><span>menú de usuario</span></Topbar>
    </SidebarProvider>,
  )

describe('Topbar', () => {
  it('muestra el nombre de la pantalla actual', () => {
    rutaActual = '/crm'
    montar()
    expect(screen.getByText('CRM')).toBeInTheDocument()
  })

  it('una ficha abierta desde el CRM dice "CRM"; sin "volver", "Contactos"', () => {
    rutaActual = '/contacts/7a636d2f-be56-4492-80ed-3bf23ba90e39'
    busquedaActual = 'volver=%2Fcrm'
    const { unmount } = montar()
    expect(screen.getByText('CRM')).toBeInTheDocument()
    unmount()
    busquedaActual = ''
    montar()
    expect(screen.getByText('Contactos')).toBeInTheDocument()
  })

  it('muestra la sección arriba del título cuando el ítem cuelga de un desplegable', () => {
    rutaActual = '/properties/new'
    montar()
    expect(screen.getByText('Propiedades')).toBeInTheDocument()
    expect(screen.getByText('Nueva')).toBeInTheDocument()
  })

  it('no añade elementos de encabezado semántico (h1/h2/h3...)', () => {
    montar()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('tiene el botón para abrir y cerrar el menú', () => {
    montar()
    expect(screen.getByRole('button', { name: /men[úu]/i })).toBeInTheDocument()
  })

  it('renderiza lo que le pasen a la derecha', () => {
    montar()
    expect(screen.getByText('menú de usuario')).toBeInTheDocument()
  })
})

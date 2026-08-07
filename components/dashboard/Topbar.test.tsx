// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Topbar } from './Topbar'
import { getNavSections } from '@/lib/nav/sections'

let rutaActual = '/crm'
vi.mock('next/navigation', () => ({ usePathname: () => rutaActual }))

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
  it('muestra el nombre de la pantalla actual como encabezado', () => {
    rutaActual = '/crm'
    montar()
    expect(screen.getByRole('heading', { name: 'CRM' })).toBeInTheDocument()
  })

  it('muestra la sección arriba del título cuando el ítem cuelga de un desplegable', () => {
    rutaActual = '/properties/new'
    montar()
    expect(screen.getByText('Propiedades')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nueva' })).toBeInTheDocument()
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

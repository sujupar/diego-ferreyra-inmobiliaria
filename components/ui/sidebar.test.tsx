// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
} from './sidebar'

/** `useIsMobile` (hooks/use-mobile.ts) decide por `window.innerWidth`, no por
 *  `matches` del mock de matchMedia de abajo — hay que pisarlo a mano. */
function setInnerWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    addListener: () => {}, removeListener: () => {},
  })) as unknown as typeof window.matchMedia
})

describe('primitivas del sidebar', () => {
  it('monta y dibuja un grupo con su ítem', () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Captación</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/properties">Propiedades</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    )

    expect(screen.getByText('Captación')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Propiedades' })).toHaveAttribute('href', '/properties')
  })

  // Ronda de arreglos 2 — H1: en el Sheet móvil, Escape necesitaba DOS
  // pulsaciones. Causa: SidebarMenuButton con `tooltip` armaba el Tooltip de
  // Radix SIEMPRE y solo lo tapaba con `hidden` en el TooltipContent; Radix
  // igual lo ABRÍA al enfocar (aria-describedby puesto) y su Escape se comía
  // la primera pulsación. Fix: en móvil no se arma el Tooltip.
  it('en móvil, un ítem con tooltip NO abre el Tooltip de Radix al enfocar (H1: se comía el primer Escape del Sheet)', () => {
    setInnerWidth(375)
    try {
      render(
        <SidebarProvider>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Propiedades">
                <span>Propiedades</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarProvider>,
      )
      const boton = screen.getByRole('button', { name: 'Propiedades' })
      fireEvent.focus(boton)
      expect(boton).not.toHaveAttribute('aria-describedby')
    } finally {
      setInnerWidth(1280)
    }
  })

  it('en desktop colapsado, el tooltip SIGUE abriéndose al enfocar (no romper el caso que sí lo necesita)', async () => {
    setInnerWidth(1280)
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Propiedades">
                  <span>Propiedades</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    )
    const boton = screen.getByRole('button', { name: 'Propiedades' })
    fireEvent.focus(boton)
    await waitFor(() => expect(boton).toHaveAttribute('aria-describedby'))
  })

  // H2: el ☰ (SidebarTrigger) no es un Dialog.Trigger de Radix — abre el
  // Sheet por estado controlado, así que sin `onCloseAutoFocus` el foco caía
  // en <body> al cerrar y quien navegaba con teclado tenía que tabular desde
  // cero. Confirmado en rojo contra el código sin el fix: sin él, este mismo
  // test falla porque `document.activeElement` es `<body>`.
  it('en móvil, al cerrar el Sheet con Escape el foco vuelve al botón ☰ (H2)', async () => {
    setInnerWidth(375)
    try {
      render(
        <SidebarProvider>
          <SidebarTrigger />
          <Sidebar>
            <SidebarContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <span>Propiedades</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>,
      )
      const disparador = screen.getByRole('button', { name: 'Alternar menú lateral' })
      fireEvent.click(disparador)
      const item = await screen.findByRole('button', { name: 'Propiedades' })
      fireEvent.keyDown(item, { key: 'Escape' })
      await waitFor(() => expect(document.activeElement).toBe(disparador))
    } finally {
      setInnerWidth(1280)
    }
  })
})

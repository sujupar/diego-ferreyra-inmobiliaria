// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, SidebarMenuBadge,
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

  // Ronda de arreglos 3 — objetivo táctil de 44px SOLO en el panel móvil
  // (spec §1.3/§1.6). El riel desktop (32px, h-8/h-7) es correcto donde se
  // apunta con mouse — no se toca. El menú viejo daba ~40px; 32px en el
  // panel móvil era una regresión.
  it('en móvil, un ítem del menú alcanza el objetivo táctil de 44px (h-11)', () => {
    setInnerWidth(375)
    try {
      render(
        <SidebarProvider>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <span>Propiedades</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarProvider>,
      )
      const boton = screen.getByRole('button', { name: 'Propiedades' })
      expect(boton.className).toContain('h-11')
      expect(boton.className).not.toContain('h-8')
    } finally {
      setInnerWidth(1280)
    }
  })

  it('en desktop, el ítem del menú sigue en h-8 (32px) — no es una regresión de esta ronda', () => {
    setInnerWidth(1280)
    render(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <span>Propiedades</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>,
    )
    const boton = screen.getByRole('button', { name: 'Propiedades' })
    expect(boton.className).toContain('h-8')
    expect(boton.className).not.toContain('h-11')
  })

  it('en móvil, un sub-ítem del riel TAMBIÉN alcanza 44px', () => {
    setInnerWidth(375)
    try {
      render(
        <SidebarProvider>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton href="/properties">
                <span>Listado</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </SidebarProvider>,
      )
      const link = screen.getByRole('link', { name: 'Listado' })
      expect(link.className).toContain('h-11')
      expect(link.className).not.toContain('h-7')
    } finally {
      setInnerWidth(1280)
    }
  })

  it('en desktop, el sub-ítem sigue en h-7 (28px) — no es una regresión de esta ronda', () => {
    setInnerWidth(1280)
    render(
      <SidebarProvider>
        <SidebarMenuSub>
          <SidebarMenuSubItem>
            <SidebarMenuSubButton href="/properties">
              <span>Listado</span>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      </SidebarProvider>,
    )
    const link = screen.getByRole('link', { name: 'Listado' })
    expect(link.className).toContain('h-7')
    expect(link.className).not.toContain('h-11')
  })

  // El activo pinta la etiqueta navy (--brand): el badge del Inbox tiene que
  // acompañarla, no quedarse en el carbón de sidebar-accent-foreground.
  it('el badge acompaña al ítem activo con el color de marca, no con el carbón del hover', () => {
    render(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive>
              <span>Inbox</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>3</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>,
    )
    const badge = screen.getByText('3')
    expect(badge.className).toContain('peer-data-[active=true]/menu-button:text-brand')
    expect(badge.className).not.toContain('peer-data-[active=true]/menu-button:text-sidebar-accent-foreground')
  })
})

describe('atajo Cmd/Ctrl+B', () => {
  /** El marco del menú lleva `data-state` = expanded | collapsed. */
  function marco() {
    return document.querySelector('[data-slot="sidebar"]')!
  }

  function montarConCampo() {
    setInnerWidth(1280)
    return render(
      <SidebarProvider>
        <Sidebar collapsible="icon" />
        <textarea data-testid="mensaje" />
      </SidebarProvider>,
    )
  }

  it('con el foco en un campo de texto NO colapsa el menú (el teclado es de quien escribe)', () => {
    montarConCampo()
    expect(marco()).toHaveAttribute('data-state', 'expanded')

    // Escribiendo una respuesta en el chat del Inbox, Cmd+B es "negrita" por
    // costumbre. El atajo escucha en `window`, así que sin guarda se lo robaba
    // a CUALQUIER campo de la plataforma — y el colapso queda en la cookie
    // `sidebar_state` durante 7 días.
    const campo = screen.getByTestId('mensaje')
    campo.focus()
    fireEvent.keyDown(campo, { key: 'b', metaKey: true })

    expect(marco()).toHaveAttribute('data-state', 'expanded')
  })

  it('fuera de un campo, el atajo sigue funcionando', () => {
    montarConCampo()
    expect(marco()).toHaveAttribute('data-state', 'expanded')

    fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true })

    expect(marco()).toHaveAttribute('data-state', 'collapsed')
  })
})

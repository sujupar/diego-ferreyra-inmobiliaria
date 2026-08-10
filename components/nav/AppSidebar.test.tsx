// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
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

/** `useIsMobile` decide por `window.innerWidth`, no por el mock de matchMedia. */
function setInnerWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

/** El menú en un teléfono: el panel se abre con el ☰, como en la app real. */
const montarMovil = (role: Parameters<typeof getNavSections>[0]) => {
  setInnerWidth(375)
  return render(
    <SidebarProvider>
      <SidebarTrigger />
      <AppSidebar groups={getNavSections(role)} logoUrl="/logo.png" />
    </SidebarProvider>,
  )
}

const abrirPanelMovil = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Alternar menú lateral' }))

beforeEach(() => {
  rutaActual = '/properties'
  setInnerWidth(1280)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ new: 7 }) }))
})

describe('AppSidebar', () => {
  it('dibuja los títulos de grupo como texto, no como botones', () => {
    montar('admin')
    expect(screen.getByText('Captación')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Captación' })).not.toBeInTheDocument()
  })

  it('el título de grupo lleva la clase eyebrow (mayúsculas espaciadas del spec)', () => {
    montar('admin')
    expect(screen.getByText('Captación').className).toContain('eyebrow')
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
    expect(activo.className).toContain('data-[active=true]:before:bg-brand')
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

  it('refresca el contador del Inbox cada 60s, y deja de pedirlo al desmontar', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ new: 7 }) })
      vi.stubGlobal('fetch', fetchMock)

      const { unmount } = montar('admin')
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(60_000)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      // Invariante 3 del cleanup: el intervalo se limpia al desmontar, no
      // sigue pidiendo el contador de un menú que ya no está en pantalla.
      unmount()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
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

  it('el disparador activo no pierde la marca al hover mientras el flotante está abierto (data-active + data-state=open a la vez)', () => {
    // Ronda de arreglos 1: el disparador del flotante colapsado es el ÚNICO
    // elemento de la app donde conviven data-active=true (la pantalla actual
    // vive en este grupo) y data-state=open (Radix se lo pone al abrirse). La
    // regla vieja de shadcn `data-[state=open]:hover:bg-sidebar-accent`
    // empataba en especificidad con `data-[active=true]:hover:bg-brand-soft`
    // y ganaba el gris con el mouse encima. Guarda: la clase compuesta con
    // más especificidad tiene que estar.
    rutaActual = '/properties/new'
    montarColapsado('admin')
    const disparador = screen.getByRole('button', { name: /Propiedades/ })
    expect(disparador).toHaveAttribute('data-active', 'true')
    expect(disparador.className).toContain('data-[active=true]:data-[state=open]:hover:bg-brand-soft')
    expect(disparador.className).toContain('data-[active=true]:data-[state=open]:hover:text-brand')
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

describe('AppSidebar en celular (el panel es un Dialog modal)', () => {
  // Radix pone `pointer-events:none` en el <body> mientras el Sheet está
  // abierto y la primitiva le esconde la X. Si el panel no se cierra al elegir
  // una opción, la navegación ocurre POR DETRÁS y la pantalla queda intocable:
  // el síntoma es "toqué CRM y no pasó nada", en CADA navegación desde el menú.
  it('elegir un ítem suelto cierra el panel', async () => {
    montarMovil('admin')
    abrirPanelMovil()

    const crm = await screen.findByRole('link', { name: /CRM/ })
    fireEvent.click(crm)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('elegir un sub-ítem de un desplegable también cierra el panel', async () => {
    rutaActual = '/properties'
    montarMovil('admin')
    abrirPanelMovil()

    // El desplegable "Propiedades" arranca abierto porque contiene la ruta actual.
    const listado = await screen.findByRole('link', { name: 'Listado' })
    fireEvent.click(listado)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('tocar el logo también cierra el panel', async () => {
    montarMovil('admin')
    abrirPanelMovil()

    fireEvent.click(await screen.findByRole('link', { name: /ir al inicio/ }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('una navegación que llega de afuera del menú también lo cierra', async () => {
    // El `onClick` no cubre todo: el estado del panel vive en el layout, que no
    // se remonta al navegar. Si la ruta cambia por cualquier otro camino (un
    // link del contenido, el historial del navegador), el panel tiene que irse.
    const { rerender } = montarMovil('admin')
    abrirPanelMovil()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    rutaActual = '/inbox'
    rerender(
      <SidebarProvider>
        <SidebarTrigger />
        <AppSidebar groups={getNavSections('admin')} logoUrl="/logo.png" />
      </SidebarProvider>,
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('en escritorio el clic NO toca el panel móvil (el riel no se cierra solo)', () => {
    montar('admin')
    fireEvent.click(screen.getByRole('link', { name: /CRM/ }))
    // No hay Sheet en escritorio: si el cierre no estuviera guardado por
    // `isMobile`, esto igual pasaría — el valor de este caso es fijar que el
    // menú de escritorio sigue montado y utilizable después del clic.
    expect(screen.getByRole('link', { name: /CRM/ })).toBeInTheDocument()
  })
})

describe('AppSidebar — el logo en modo ícono', () => {
  it('colapsado se esconde el logotipo y aparece un isotipo cuadrado', () => {
    montarColapsado('admin')
    const logo = screen.getByRole('link', { name: /ir al inicio/ })
    const img = logo.querySelector('img')!
    // El logotipo es 4,57:1: en la caja de ~16px que deja el riel de 48px se
    // dibujaba como una franja de ~3,5px de alto. Colapsado no se muestra.
    expect(img.className).toContain('group-data-[collapsible=icon]:hidden')
    expect(screen.getByTestId('isotipo-colapsado').className).toContain('group-data-[collapsible=icon]:flex')
  })

  it('el link del logo conserva su nombre accesible en los dos estados', () => {
    // El nombre NO puede salir del `alt` de la imagen: esa imagen desaparece al
    // colapsar y el link se quedaría sin nombre (o tomaría el "DF" del isotipo).
    montar('admin')
    expect(screen.getByRole('link', { name: 'Diego Ferreyra Inmobiliaria — ir al inicio' })).toHaveAttribute('href', '/')
    expect(screen.getByTestId('isotipo-colapsado')).toHaveAttribute('aria-hidden', 'true')
  })
})

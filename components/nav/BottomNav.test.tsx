// @vitest-environment happy-dom
/**
 * La barra inferior del celular. Lo que estos tests protegen no es el dibujo
 * sino las cuatro promesas que la hacen aceptable:
 *
 *  1. en escritorio NO EXISTE (la promesa del sistema móvil);
 *  2. no ofrece pantallas que el rol no puede ver;
 *  3. no reemplaza al menú — el último lugar abre el panel de siempre;
 *  4. desaparece cuando el chat se queda con la pantalla entera.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { BottomNav } from './BottomNav'
import { getNavSections } from '@/lib/nav/sections'

const rutaActual = { pathname: '/inicio', search: '' }
const setOpenMobile = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => rutaActual.pathname,
  useSearchParams: () => new URLSearchParams(rutaActual.search),
}))

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ setOpenMobile, isMobile: true, state: 'expanded' }),
}))

beforeEach(() => {
  rutaActual.pathname = '/inicio'
  rutaActual.search = ''
  setOpenMobile.mockClear()
  // El contador de leads pide por red al montar; sin esto el test se llena de
  // ruido que no tiene nada que ver con la navegación.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})

function montar(role: Parameters<typeof getNavSections>[0] = 'asesor') {
  return render(<BottomNav groups={getNavSections(role)} />)
}

describe('BottomNav — de 768px para arriba no existe', () => {
  it('la barra entera va con `md:hidden`', () => {
    const { container } = montar()
    const barra = container.querySelector('nav') as HTMLElement
    expect(barra.className).toContain('md:hidden')
  })

  it('está en el flujo, no flotando: nada queda tapado abajo', () => {
    // Si fuera `fixed`, cada una de las 39 pantallas necesitaría un relleno
    // abajo para que su último control no quedara debajo de la barra.
    const barra = montar().container.querySelector('nav') as HTMLElement
    expect(barra.className).not.toContain('fixed')
    expect(barra.className).toContain('shrink-0')
  })

  it('respeta la barra de gestos del teléfono', () => {
    const barra = montar().container.querySelector('nav') as HTMLElement
    expect(barra.className).toContain('pb-safe')
  })
})

describe('BottomNav — qué ofrece', () => {
  it('el asesor ve sus cuatro accesos y el menú', () => {
    const { container } = montar('asesor')
    const etiquetas = Array.from(container.querySelectorAll('a')).map(a => a.textContent?.trim())
    expect(etiquetas).toEqual(['Inicio', 'Pendientes', 'Inbox', 'CRM'])
    expect(container.querySelector('button')?.textContent).toContain('Menú')
  })

  it('el abogado NO ve el Inbox ni el CRM: la barra sale de SU menú', () => {
    const { container } = montar('abogado')
    const hrefs = Array.from(container.querySelectorAll('a')).map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(['/tasks', '/properties/review'])
  })

  it('SIEMPRE hay una salida al resto de la aplicación', () => {
    // Cuatro accesos no pueden representar 39 pantallas. Sin este botón la barra
    // sería una jaula.
    for (const role of ['asesor', 'coordinador', 'admin', 'abogado'] as const) {
      const { container } = montar(role)
      const menu = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Menú'))
      expect(menu, `el rol ${role} se queda sin acceso al menú`).toBeTruthy()
    }
  })

  it('"Menú" abre el panel de siempre, no una navegación propia', () => {
    const { container } = montar()
    const menu = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Menú'))!
    fireEvent.click(menu)
    expect(setOpenMobile).toHaveBeenCalledWith(true)
  })

  it('al navegar desde la barra se cierra el panel si estaba abierto', () => {
    // Sin esto se navega POR DETRÁS de un panel que sigue tapando la pantalla —
    // el mismo defecto que ya se arregló una vez en el menú lateral.
    const { container } = montar()
    fireEvent.click(container.querySelector('a')!)
    expect(setOpenMobile).toHaveBeenCalledWith(false)
  })
})

describe('BottomNav — dónde estoy', () => {
  it('marca el destino actual, y uno solo', () => {
    rutaActual.pathname = '/crm'
    const { container } = montar()
    const marcados = container.querySelectorAll('[aria-current="page"]')
    expect(marcados).toHaveLength(1)
    expect(marcados[0].getAttribute('href')).toBe('/crm')
  })

  it('una pantalla de adentro marca su sección', () => {
    rutaActual.pathname = '/crm/algun-deal'
    const { container } = montar()
    expect(container.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/crm')
  })

  it('en una pantalla que no está en la barra no marca nada', () => {
    rutaActual.pathname = '/redes-sociales'
    const { container } = montar()
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
  })
})

describe('BottomNav — el chat se queda con la pantalla', () => {
  it('con una conversación abierta, la barra desaparece', () => {
    // El compositor está pegado al piso: una barra de navegación ahí abajo le
    // roba el lugar a donde se escribe y compite con el botón de enviar.
    rutaActual.pathname = '/inbox'
    rutaActual.search = 'tab=whatsapp&chat=5491122334455'
    expect(montar().container.querySelector('nav')).toBeNull()
  })

  it('en el Inbox SIN chat abierto, la barra está', () => {
    rutaActual.pathname = '/inbox'
    rutaActual.search = 'tab=whatsapp'
    expect(montar().container.querySelector('nav')).not.toBeNull()
  })

  it('un `?chat=` en otra pantalla no la esconde', () => {
    // La regla es del Inbox, no de cualquier parámetro que se llame igual.
    rutaActual.pathname = '/crm'
    rutaActual.search = 'chat=algo'
    expect(montar().container.querySelector('nav')).not.toBeNull()
  })
})

// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFiltrosUrl } from './use-filtros-url'

/**
 * La parte difícil de estos filtros no es leer/escribir strings (eso ya está
 * cubierto en `url-state.test.ts`) sino la MÁQUINA DE ESTADOS: la URL commitea
 * 200-700 ms después de la escritura y en esa ventana el usuario sigue tocando
 * cosas. Acá el commit NO es automático: cada test decide cuándo llega, que es
 * exactamente donde vivían los dos defectos medidos en el navegador.
 */

// URL simulada, leída en cada render igual que hace Next.
let busqueda = ''
const escrituras: string[] = []

vi.mock('next/navigation', () => ({
  usePathname: () => '/properties',
  useSearchParams: () => new URLSearchParams(busqueda),
  // Ojo: NO mueve `busqueda`. El commit es asíncrono en la vida real y los
  // tests lo simulan con `commitear`.
  useRouter: () => ({ replace: (href: string) => { escrituras.push(href) } }),
}))

const DEFECTOS = { status: '', from: '', to: '', mios: '' }
const PERMITIDOS = { status: ['', 'approved', 'active'], mios: ['', '1'] }
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
// Misma normalización que usa Propiedades: un `<input type=date>` de Chrome
// acepta años de 5 dígitos, la API los rechaza con un 500.
const normalizar = (f: typeof DEFECTOS) => ({
  ...f,
  from: FECHA_RE.test(f.from) ? f.from : '',
  to: FECHA_RE.test(f.to) ? f.to : '',
})

function montar(inicial = '') {
  busqueda = inicial
  escrituras.length = 0
  return renderHook(() => useFiltrosUrl({ defectos: DEFECTOS, permitidos: PERMITIDOS, normalizar }))
}

type Vista = ReturnType<typeof montar>

/** Simula que Next terminó de commitear una URL. */
function commitear(vista: Vista, href: string) {
  const i = href.indexOf('?')
  busqueda = i === -1 ? '' : href.slice(i + 1)
  act(() => { vista.rerender() })
}

/** El último href que recibió `router.replace`. */
const ultimaEscritura = () => escrituras[escrituras.length - 1]

afterEach(() => { vi.useRealTimers() })

describe('useFiltrosUrl — lectura de la URL', () => {
  it('sin querystring devuelve los valores por defecto', () => {
    const { result } = montar('')
    expect(result.current.filtros).toEqual(DEFECTOS)
    expect(result.current.aplicados).toEqual(DEFECTOS)
    expect(result.current.escribiendo).toBe(false)
  })

  it('un valor fuera de la lista de permitidos cae al defecto', () => {
    const { result } = montar('status=noexiste')
    expect(result.current.aplicados.status).toBe('')
  })

  it('aplica la normalización de la pantalla, no solo la lista de permitidos', () => {
    const { result } = montar('from=basura&to=2026-08-08')
    expect(result.current.aplicados.from).toBe('')
    expect(result.current.aplicados.to).toBe('2026-08-08')
  })
})

describe('useFiltrosUrl — escritura simple', () => {
  it('muestra el valor nuevo al instante, antes de que la URL commitee', () => {
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ status: 'approved' }) })
    // El control ya lo refleja...
    expect(vista.result.current.filtros.status).toBe('approved')
    expect(vista.result.current.escribiendo).toBe(true)
    // ...pero la URL confirmada todavía no, y eso es lo que se le pide al server.
    expect(vista.result.current.aplicados.status).toBe('')
    expect(ultimaEscritura()).toBe('/properties?status=approved')
  })

  it('suelta el espejo cuando llega la URL que escribió', () => {
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ status: 'approved' }) })
    commitear(vista, ultimaEscritura())
    expect(vista.result.current.escribiendo).toBe(false)
    expect(vista.result.current.aplicados.status).toBe('approved')
    expect(vista.result.current.filtros.status).toBe('approved')
  })

  it('escribe la URL sin las claves que están en su valor por defecto', () => {
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    expect(ultimaEscritura()).toBe('/properties?mios=1')
  })
})

describe('useFiltrosUrl — dos escrituras seguidas (carrera)', () => {
  it('la segunda escritura conserva la primera aunque la URL no haya commiteado', () => {
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    // Sin commitear nada en el medio: es el caso que perdía el primer filtro.
    act(() => { vista.result.current.aplicar({ status: 'approved' }) })
    expect(ultimaEscritura()).toBe('/properties?mios=1&status=approved')
    expect(vista.result.current.filtros).toMatchObject({ mios: '1', status: 'approved' })
  })

  it('un commit intermedio no suelta el espejo ni pisa lo último escrito', () => {
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    const intermedia = ultimaEscritura()
    act(() => { vista.result.current.aplicar({ status: 'approved' }) })
    const final = ultimaEscritura()

    // Next commitea PRIMERO la URL intermedia (el estado que rompía en el
    // navegador: el control se destildaba solo y el filtro siguiente pisaba).
    commitear(vista, intermedia)
    expect(vista.result.current.escribiendo).toBe(true)
    expect(vista.result.current.filtros).toMatchObject({ mios: '1', status: 'approved' })

    commitear(vista, final)
    expect(vista.result.current.escribiendo).toBe(false)
    expect(vista.result.current.aplicados).toMatchObject({ mios: '1', status: 'approved' })
  })

  it('una tercera escritura sobre un commit intermedio conserva las dos anteriores', () => {
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    const intermedia = ultimaEscritura()
    act(() => { vista.result.current.aplicar({ status: 'approved' }) })
    commitear(vista, intermedia)
    act(() => { vista.result.current.aplicar({ from: '2026-08-01', to: '2026-08-08' }) })
    expect(ultimaEscritura()).toBe(
      '/properties?from=2026-08-01&mios=1&status=approved&to=2026-08-08',
    )
  })
})

describe('useFiltrosUrl — sin temporizadores (N1)', () => {
  it('el espejo no se suelta solo por el paso del tiempo', () => {
    vi.useFakeTimers()
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    // La red de seguridad vieja soltaba a los 3 s aunque la escritura no
    // hubiera commiteado: el checkbox se destildaba solo y el filtro siguiente
    // partía del valor viejo. Ahora el único que suelta es el commit.
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(vista.result.current.escribiendo).toBe(true)
    expect(vista.result.current.filtros.mios).toBe('1')

    // Y el filtro siguiente sigue partiendo de lo escrito, no de la URL vieja.
    act(() => { vista.result.current.aplicar({ status: 'approved' }) })
    expect(ultimaEscritura()).toBe('/properties?mios=1&status=approved')
  })
})

describe('useFiltrosUrl — navegación externa', () => {
  it('una URL que no escribimos suelta el espejo y resincroniza', () => {
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    // Un link o un replace de otra pantalla: nunca escribimos esto.
    commitear(vista, '/properties?status=active')
    expect(vista.result.current.escribiendo).toBe(false)
    expect(vista.result.current.filtros).toMatchObject({ status: 'active', mios: '' })
  })

  it('tras una navegación externa, la escritura siguiente parte de la URL nueva', () => {
    const vista = montar('')
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    commitear(vista, '/properties?status=active')
    act(() => { vista.result.current.aplicar({ from: '2026-08-01', to: '2026-08-08' }) })
    // `mios=1` quedó atrás porque la navegación externa mandó: no resucita.
    expect(ultimaEscritura()).toBe('/properties?from=2026-08-01&status=active&to=2026-08-08')
  })

  it('Atrás suelta el espejo aunque la URL vuelva justo a donde estábamos', () => {
    // El Atrás puede caer en la URL de la que partimos, que SÍ pertenece a la
    // ráfaga. Sin el evento `popstate` el espejo quedaría esperando un commit
    // que ya no va a llegar — y con él, la lista girando para siempre.
    const vista = montar('status=active')
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    expect(vista.result.current.escribiendo).toBe(true)
    act(() => { window.dispatchEvent(new Event('popstate')) })
    expect(vista.result.current.escribiendo).toBe(false)
    expect(vista.result.current.filtros).toMatchObject({ status: 'active', mios: '' })
  })
})

describe('useFiltrosUrl — escritura rechazada (N3)', () => {
  it('un parche descartado entero avisa y no deja el espejo puesto', () => {
    const vista = montar('')
    let resultado!: ReturnType<typeof vista.result.current.aplicar>
    act(() => { resultado = vista.result.current.aplicar({ from: '50000-01-01', to: '50000-02-02' }) })
    expect(resultado.estado).toBe('rechazado')
    expect(resultado.rechazadas.sort()).toEqual(['from', 'to'])
    // Ni URL nueva ni espejo: si no, la lista quedaría en carga esperando una
    // escritura que nunca va a commitear.
    expect(escrituras).toHaveLength(0)
    expect(vista.result.current.escribiendo).toBe(false)
    expect(vista.result.current.filtros).toEqual(DEFECTOS)
  })

  it('un parche a medias escribe lo válido y avisa de lo descartado', () => {
    const vista = montar('')
    let resultado!: ReturnType<typeof vista.result.current.aplicar>
    act(() => { resultado = vista.result.current.aplicar({ from: '50000-01-01', to: '2026-08-08' }) })
    expect(resultado.estado).toBe('escrito')
    expect(resultado.rechazadas).toEqual(['from'])
    expect(ultimaEscritura()).toBe('/properties?to=2026-08-08')
    expect(vista.result.current.filtros.from).toBe('')
  })

  it('escribir el mismo valor que ya estaba es «sin-cambios», no «rechazado»', () => {
    const vista = montar('status=approved')
    let resultado!: ReturnType<typeof vista.result.current.aplicar>
    act(() => { resultado = vista.result.current.aplicar({ status: 'approved' }) })
    expect(resultado.estado).toBe('sin-cambios')
    expect(resultado.rechazadas).toEqual([])
    expect(escrituras).toHaveLength(0)
  })

  it('un valor fuera de la lista de permitidos también se reporta rechazado', () => {
    const vista = montar('')
    let resultado!: ReturnType<typeof vista.result.current.aplicar>
    act(() => { resultado = vista.result.current.aplicar({ status: 'inventado' }) })
    expect(resultado.estado).toBe('rechazado')
    expect(resultado.rechazadas).toEqual(['status'])
    expect(escrituras).toHaveLength(0)
  })
})

describe('useFiltrosUrl — parámetros ajenos', () => {
  it('una escritura conserva los parámetros que no son filtros', () => {
    const vista = montar('utm_source=mail')
    act(() => { vista.result.current.aplicar({ status: 'approved' }) })
    expect(ultimaEscritura()).toBe('/properties?utm_source=mail&status=approved')
  })

  it('dos escrituras seguidas los conservan igual', () => {
    const vista = montar('utm_source=mail')
    act(() => { vista.result.current.aplicar({ status: 'approved' }) })
    act(() => { vista.result.current.aplicar({ mios: '1' }) })
    expect(ultimaEscritura()).toBe('/properties?utm_source=mail&mios=1&status=approved')
  })

  it('limpiar borra los filtros propios y conserva los ajenos', () => {
    const vista = montar('utm_source=mail&status=approved&mios=1')
    act(() => { vista.result.current.limpiar() })
    expect(ultimaEscritura()).toBe('/properties?utm_source=mail')
    expect(vista.result.current.filtros).toEqual(DEFECTOS)
  })

  it('limpiar con la URL ya limpia no escribe nada', () => {
    const vista = montar('')
    let resultado!: ReturnType<typeof vista.result.current.limpiar>
    act(() => { resultado = vista.result.current.limpiar() })
    expect(resultado.estado).toBe('sin-cambios')
    expect(escrituras).toHaveLength(0)
    expect(vista.result.current.escribiendo).toBe(false)
  })
})

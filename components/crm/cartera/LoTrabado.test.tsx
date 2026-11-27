// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 6.3: "Lo que está trabado" y "Ver como".
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoTrabado } from './LoTrabado'
import { CarteraCRM } from './CarteraCRM'
import { AHORA_PRUEBA as AHORA, ar, datosPrueba, filaPrueba, FLORENCIA, PAULA, pasoPrueba, TOMAS } from './datos-prueba'
import { calcularTrabado } from '@/lib/crm/cartera-trabado'
import type { FilaCartera } from '@/lib/crm/cartera'
import type { DatosCartera } from '@/lib/supabase/cartera'

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}))

const irA = (b: string) => window.history.replaceState(null, '', `/crm${b ? `?${b}` : ''}`)
const direccion = () => new URLSearchParams(window.location.search)

beforeEach(() => {
  irA('')
  vi.unstubAllGlobals()
})

// Dos solicitudes sin contacto (una anterior al registro), un realizado sin asesor del
// sistema anterior, un seguimiento frío y uno al día.
function filasTrabadas(): FilaCartera[] {
  return [
    filaPrueba({ id: 'sc-1', nombre: 'Marcela Ibáñez', ultimoContacto: null, creadoEn: ar('2026-12-01', '18:20') }),
    filaPrueba({ id: 'sc-vieja', nombre: 'Antigua', ultimoContacto: null, creadoEn: ar('2026-09-10', '10:00'), anteriorAlRegistro: true }),
    filaPrueba({ id: 'sa-1', nombre: 'Roberto Sanz', etapa: 'realizada', origen: 'historico', asesor: null }),
    filaPrueba({ id: 'sm-1', nombre: 'Mariana Vidal', etapa: 'seguimiento', asesor: { ...TOMAS, activo: true }, ultimoContacto: null }),
    filaPrueba({ id: 'ok-1', etapa: 'seguimiento', asesor: { ...TOMAS, activo: true }, proximo: pasoPrueba('2026-12-05', '10:00') }),
  ]
}

describe('LoTrabado', () => {
  // Al 20 de diciembre ya pasaron 14 días desde el inicio del registro (26/11).
  const LEJOS = new Date('2026-12-20T13:40:00Z')
  const montar = (filas: FilaCartera[], o: { activo?: '' | 'sin-contacto' | 'sin-asesor' | 'sin-movimiento'; ahora?: Date } = {}) => {
    const alFiltrar = vi.fn()
    const alReintentar = vi.fn()
    const ahora = o.ahora ?? LEJOS
    render(
      <LoTrabado trabado={calcularTrabado(filas, ahora)} ahora={ahora} activo={o.activo ?? ''} volver="/crm" alFiltrar={alFiltrar} alReintentar={alReintentar} />,
    )
    return { alFiltrar, alReintentar }
  }
  const columna = (clave: string) => {
    const c = document.querySelector(`[data-columna="${clave}"]`)
    if (!(c instanceof HTMLElement)) throw new Error(`no está la columna ${clave}`)
    return c
  }

  it('las tres columnas con su base, la fecha del cálculo y el renglón de las anteriores al registro', () => {
    montar(filasTrabadas())
    expect(screen.getByText('al dom 20 dic, 10:40')).toBeInTheDocument()
    expect(screen.getByText('De 1 solicitudes abiertas. Llama la coordinación.')).toBeInTheDocument()
    expect(screen.getByText('Además, 1 anteriores al registro de llamadas, sin dato.')).toBeInTheDocument()
    expect(screen.getByText('Ya pasaron la solicitud y nadie los tiene. De 3 procesos.')).toBeInTheDocument()
    expect(screen.getByText('Sin contacto hace 14 días o más. De 2 seguimientos.')).toBeInTheDocument()
  })

  it('cada nombre con su detalle: espera, etapa y origen, días y asesor', () => {
    montar(filasTrabadas())
    expect(within(columna('sin-contacto')).getByText('Marcela Ibáñez')).toBeInTheDocument()
    expect(within(columna('sin-contacto')).getByText(/^Espera hace 18 días/)).toBeInTheDocument()
    expect(within(columna('sin-asesor')).getByText('Realizada · Histórico')).toBeInTheDocument()
    expect(within(columna('sin-movimiento')).getByText('24 días · Tomás Agüero')).toBeInTheDocument()
  })

  it('burbuja de alerta con procesos, neutra con cero', () => {
    montar(filasTrabadas().filter((f) => f.id !== 'sa-1'))
    expect(columna('sin-contacto').querySelector('[data-burbuja]')).toHaveAttribute('data-burbuja', 'alerta')
    expect(columna('sin-asesor').querySelector('[data-burbuja]')).toHaveAttribute('data-burbuja', 'neutra')
  })

  it('hasta cinco nombres y el botón con el total', async () => {
    const muchas = Array.from({ length: 7 }, (_, i) => filaPrueba({ id: `s-${i}`, nombre: `Solicitud ${i}`, ultimoContacto: null, creadoEn: ar('2026-12-01', `1${i}:00`) }))
    const { alFiltrar } = montar(muchas)
    expect(within(columna('sin-contacto')).getAllByRole('link')).toHaveLength(5)
    await userEvent.click(within(columna('sin-contacto')).getByRole('button', { name: 'Ver los 7 en la lista' }))
    expect(alFiltrar).toHaveBeenCalledWith('sin-contacto')
  })

  it('"Ver el proceso en la lista" con uno solo, y "Quitar este filtro" si ya está puesto', () => {
    montar(filasTrabadas(), { activo: 'sin-asesor' })
    expect(within(columna('sin-contacto')).getByRole('button', { name: 'Ver el proceso en la lista' })).toBeInTheDocument()
    expect(within(columna('sin-asesor')).getByRole('button', { name: 'Quitar este filtro' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('en el celular los nombres se esconden (solo el resumen)', () => {
    montar(filasTrabadas())
    const nombres = columna('sin-contacto').querySelector('[data-nombres]')
    expect(nombres).toHaveClass('hidden')
    expect(nombres).toHaveClass('md:flex')
  })

  it('si no se puede contar: el error sin ningún número y "Reintentar"', async () => {
    const { alReintentar } = montar(filasTrabadas().map((f) => ({ ...f, ultimoContacto: 'error' as const })))
    expect(screen.getByText('No se pudo cargar lo trabado')).toBeInTheDocument()
    expect(screen.getByText('No mostramos ningún número hasta poder contarlo.')).toBeInTheDocument()
    expect(document.querySelector('[data-burbuja]')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(alReintentar).toHaveBeenCalled()
  })
})

// ── En la pantalla ───────────────────────────────────────────────────────────────────────

function carteraDueno(): DatosCartera {
  return datosPrueba({ generadoEn: new Date('2026-12-20T13:40:00Z').toISOString(), filas: filasTrabadas() })
}
const OPCIONES = [
  { id: PAULA.id, etiqueta: `${PAULA.nombre} · coordinación` },
  { id: FLORENCIA.id, etiqueta: `${FLORENCIA.nombre} · asesor` },
]
const montarCRM = (d: DatosCartera, rol = 'dueno') =>
  render(<CarteraCRM inicial={d} rol={rol} opcionesVerComo={OPCIONES} avisoInicial={null} />)

describe('Lo que está trabado en la pantalla del dueño', () => {
  it('"Ver los N en la lista" filtra la lista, pone la ficha y el pie lo cuenta; y vuelve con "Quitar este filtro"', async () => {
    montarCRM(carteraDueno())
    const sinContacto = document.querySelector('[data-columna="sin-contacto"]')
    if (!(sinContacto instanceof HTMLElement)) throw new Error('sin columna')
    await userEvent.click(within(sinContacto).getByRole('button', { name: 'Ver el proceso en la lista' }))
    expect(direccion().get('trabado')).toBe('sin-contacto')
    expect(screen.getByRole('button', { name: 'Sacar el filtro Sin primer contacto' })).toBeInTheDocument()
    expect(screen.getByText('Mostrando 1 de 1 procesos abiertos')).toBeInTheDocument()
    await userEvent.click(within(sinContacto).getByRole('button', { name: 'Quitar este filtro' }))
    expect(direccion().get('trabado')).toBeNull()
  })

  it('los filtros de la lista no cambian los números de lo trabado', async () => {
    montarCRM(carteraDueno())
    const antes = document.querySelector('[data-trabado]')?.textContent
    await userEvent.selectOptions(screen.getAllByLabelText('Origen')[0], 'referido')
    expect(document.querySelector('[data-trabado]')?.textContent).toBe(antes)
  })

  it('no aparece en cerrados', async () => {
    montarCRM(carteraDueno())
    await userEvent.click(screen.getByRole('button', { name: /^Cerrados/ }))
    expect(screen.queryByRole('region', { name: 'Lo que está trabado' })).toBeNull()
  })
})

// ── Ver como ─────────────────────────────────────────────────────────────────────────────

function carteraDeFlorencia(): DatosCartera {
  return datosPrueba({
    vista: { tipo: 'asesor', persona: { id: FLORENCIA.id, nombre: FLORENCIA.nombre, rol: 'asesor' }, mirando: true },
    asesores: null,
    opcionesVerComo: null,
    filas: [filaPrueba({ id: 'de-flor', nombre: 'Claudio Benavídez', etapa: 'seguimiento', asesor: { ...FLORENCIA, activo: true }, proximo: pasoPrueba('2026-12-05', '10:00') })],
  })
}
function carteraDePaula(): DatosCartera {
  return datosPrueba({
    vista: { tipo: 'coordinacion', persona: { id: PAULA.id, nombre: PAULA.nombre, rol: 'coordinador' }, mirando: true },
    opcionesVerComo: null,
    filas: [filaPrueba({ id: 'de-paula', proximo: pasoPrueba('2026-12-05', '10:00') })],
  })
}

describe('Ver como', () => {
  it('las opciones: "Mi vista (dueño)" (o admin) y una por persona', () => {
    const { unmount } = montarCRM(carteraDueno())
    const opciones = within(screen.getByLabelText('Ver como')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Mi vista (dueño)', 'Paula Pandolfo · coordinación', 'Florencia Ledesma · asesor'])
    unmount()
    montarCRM(carteraDueno(), 'admin')
    expect(within(screen.getByLabelText('Ver como')).getAllByRole('option')[0]).toHaveTextContent('Mi vista (admin)')
  })

  it('elegir a un asesor: su vista con el aviso, sin "Seleccionar" ni lo trabado; "Volver a mi vista" lo saca de la dirección', async () => {
    const pedidos: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      pedidos.push(url)
      return new Response(JSON.stringify(carteraDeFlorencia()), { status: 200 })
    }))
    montarCRM(carteraDueno())
    await userEvent.selectOptions(screen.getByLabelText('Ver como'), FLORENCIA.id)
    await screen.findByText(/Estás viendo el CRM como lo ve/)
    expect(pedidos).toEqual([`/api/crm/cartera?ver_como=${FLORENCIA.id}`])
    expect(screen.getByRole('status')).toHaveTextContent(
      'Estás viendo el CRM como lo ve Florencia Ledesma (asesor). Es solo para revisar: no cambia nada de lo que esa persona ve.',
    )
    expect(screen.getByText('Los procesos de Florencia Ledesma, ordenados por el próximo paso.')).toBeInTheDocument()
    expect(direccion().get('ver')).toBe(FLORENCIA.id)
    expect(screen.queryByRole('region', { name: 'Lo que está trabado' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull()
    expect(screen.getByText('Claudio Benavídez')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Volver a mi vista' }))
    expect(direccion().get('ver')).toBeNull()
    expect(screen.queryByText(/Estás viendo el CRM como lo ve/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Lo que está trabado' })).toBeInTheDocument()
    expect(pedidos).toHaveLength(1)
  })

  it('la vista de la coordinadora: sus grupos y sin lo trabado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(carteraDePaula()), { status: 200 })))
    montarCRM(carteraDueno())
    await userEvent.selectOptions(screen.getByLabelText('Ver como'), PAULA.id)
    await screen.findByText(/Estás viendo el CRM como lo ve/)
    expect(screen.getByRole('status')).toHaveTextContent('Paula Pandolfo (coordinación)')
    expect(screen.getByText('Solicitudes, coordinadas y no realizadas, ordenadas por lo que hay que hacer primero.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Lo que está trabado' })).toBeNull()
  })

  it('dos elecciones seguidas: gana la última', async () => {
    const respuestas: ((r: Response) => void)[] = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => respuestas.push(r))))
    montarCRM(carteraDueno())
    await userEvent.selectOptions(screen.getByLabelText('Ver como'), FLORENCIA.id)
    await userEvent.selectOptions(screen.getByLabelText('Ver como'), PAULA.id)
    expect(respuestas).toHaveLength(2)
    respuestas[1](new Response(JSON.stringify(carteraDePaula()), { status: 200 }))
    await screen.findByText(/Paula Pandolfo \(coordinación\)/)
    respuestas[0](new Response(JSON.stringify(carteraDeFlorencia()), { status: 200 }))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText(/Florencia Ledesma \(asesor\)/)).toBeNull()
    expect(screen.getByText(/Paula Pandolfo \(coordinación\)/)).toBeInTheDocument()
  })

  it('un 400 vuelve a "Mi vista" con "Esa persona no tiene una vista del CRM."', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Esa persona no tiene una vista del CRM.' }), { status: 400 })))
    montarCRM(carteraDueno())
    await userEvent.selectOptions(screen.getByLabelText('Ver como'), FLORENCIA.id)
    await screen.findByText('Esa persona no tiene una vista del CRM.')
    expect(direccion().get('ver')).toBeNull()
    expect(screen.getByLabelText('Ver como')).toHaveValue('')
    expect(screen.getByRole('region', { name: 'Lo que está trabado' })).toBeInTheDocument()
  })

  it('cambiar de vista saca etapa, asesor y lo trabado, vuelve a "Abiertos" y deja la búsqueda', async () => {
    irA(`etapa=seguimiento&asesor=${TOMAS.id}&trabado=sin-movimiento&q=pinto`)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(carteraDeFlorencia()), { status: 200 })))
    montarCRM(carteraDueno())
    await userEvent.selectOptions(screen.getByLabelText('Ver como'), FLORENCIA.id)
    await waitFor(() => expect(direccion().get('ver')).toBe(FLORENCIA.id))
    expect(direccion().get('etapa')).toBeNull()
    expect(direccion().get('asesor')).toBeNull()
    expect(direccion().get('trabado')).toBeNull()
    expect(direccion().get('q')).toBe('pinto')
  })

  it('recargar mirando a un asesor sigue mostrando su vista con el aviso', () => {
    irA(`ver=${FLORENCIA.id}`)
    montarCRM(carteraDeFlorencia())
    expect(screen.getByText(/Estás viendo el CRM como lo ve/)).toBeInTheDocument()
    expect(screen.getByLabelText('Ver como')).toHaveValue(FLORENCIA.id)
    expect(screen.queryByText(/No se aplicó/)).toBeNull()
  })

  it('el selector solo existe para admin y dueño', () => {
    render(<CarteraCRM inicial={carteraDueno()} rol="coordinador" opcionesVerComo={OPCIONES} avisoInicial={null} />)
    expect(screen.queryByLabelText('Ver como')).toBeNull()
  })

  it('usa el reloj del servidor: la fecha del cálculo es la de los datos', () => {
    montarCRM({ ...carteraDueno(), generadoEn: AHORA.toISOString() })
    expect(screen.getByText('al mié 2 dic, 10:40')).toBeInTheDocument()
  })
})

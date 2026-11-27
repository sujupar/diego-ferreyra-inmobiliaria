// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 6.5: Contactos con la fila del CRM. Conserva las protecciones
// del test viejo de la pantalla (nunca "Sin contactos" si falló, "Reintentar", "Limpiar
// filtros" con el buscador) y suma las de la spec nueva.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContactosLista } from './ContactosLista'
import { ar, contactoPrueba, datosContactosPrueba, TOMAS } from './datos-prueba'

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}))

const irA = (b: string) => window.history.replaceState(null, '', `/contacts${b ? `?${b}` : ''}`)
const direccion = () => new URLSearchParams(window.location.search)
const filas = () => screen.queryAllByRole('link', { name: /^Abrir la ficha de/ })

function datos() {
  return datosContactosPrueba({
    filas: [
      contactoPrueba({ id: 'c-ana', contactoId: 'c-ana', nombre: 'Ángela Ruiz', origen: 'referido', asesor: { ...TOMAS, activo: true }, proceso: { id: 'd-1', etapa: 'seguimiento' } }),
      contactoPrueba({ id: 'c-bru', contactoId: 'c-bru', nombre: 'Bruno Pinto', telefono: '11 5555-0148', origen: 'embudo' }),
      contactoPrueba({ id: 'c-sin', contactoId: 'c-sin', nombre: 'Carla Sinproceso', proceso: null, conProcesoAbierto: false, propiedad: '', direccion: '' }),
      contactoPrueba({
        id: 'c-cer',
        contactoId: 'c-cer',
        nombre: 'Dora Cerrada',
        proceso: { id: 'd-9', etapa: 'descartado' },
        conProcesoAbierto: false,
        cerradoEn: ar('2026-11-27', '10:00'),
      }),
    ],
  })
}

beforeEach(() => {
  irA('')
  vi.unstubAllGlobals()
})

describe('Contactos por rol', () => {
  it('equipo: título, texto, "Nuevo contacto" y las columnas con "Asesor"', () => {
    render(<ContactosLista inicial={datos()} propios={false} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Contactos' })).toBeInTheDocument()
    expect(screen.getByText('Todas las personas cargadas, con su proceso, el último contacto y el próximo paso.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nuevo contacto' })).toHaveAttribute('href', '/contacts/new')
    expect(document.querySelector('[data-cabecera-filas]')).toHaveTextContent('PersonaProcesoÚltimo contactoPróximo pasoAsesor')
    expect(screen.getAllByLabelText('Asesor').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Se registró').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Etapa')).toBeNull()
  })

  it('asesor: su texto, sin columna ni filtro "Asesor"', () => {
    render(<ContactosLista inicial={{ ...datos(), asesores: null }} propios />)
    expect(screen.getByText('Tus contactos: asignados a vos, cargados por vos o con un proceso o tasación tuyos.')).toBeInTheDocument()
    expect(document.querySelector('[data-cabecera-filas]')).not.toHaveTextContent('Asesor')
    expect(screen.queryByLabelText('Asesor')).toBeNull()
  })

  it('"Con proceso abierto N" / "Sin proceso abierto N" y la lista "Personas" con "Ordenar por"', async () => {
    render(<ContactosLista inicial={datos()} propios={false} />)
    expect(screen.getByRole('button', { name: 'Con proceso abierto 2' })).toHaveAttribute('aria-pressed', 'true')
    const personas = screen.getByRole('region', { name: 'Personas' })
    expect(within(personas).getByLabelText('Ordenar por')).toBeInTheDocument()
    expect(personas.querySelector('h2 [data-burbuja]')).toBeNull()
    expect(screen.getByText('Mostrando 2 de 2 personas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sin proceso abierto 2' }))
    expect(screen.getByText('Su proceso se cerró (captado o descartado) o nunca tuvo uno.')).toBeInTheDocument()
    expect(screen.getByText('Sin proceso')).toBeInTheDocument()
    expect(screen.getByText('Descartado hace 5 días')).toBeInTheDocument()
  })

  it('toda la fila abre la ficha con la vuelta a Contactos, y debajo va el teléfono', () => {
    render(<ContactosLista inicial={datos()} propios={false} />)
    const bruno = screen.getByRole('link', { name: 'Abrir la ficha de Bruno Pinto' })
    expect(bruno).toHaveAttribute('href', '/contacts/c-bru?volver=%2Fcontacts')
    expect(bruno).toHaveTextContent('11 5555-0148')
    expect(within(screen.getByRole('link', { name: 'Abrir la ficha de Ángela Ruiz' })).getByText('Referido')).toBeInTheDocument()
  })

  it('"Nombre (A a Z)": Ángela antes que Bruno', async () => {
    render(<ContactosLista inicial={datos()} propios={false} />)
    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'nombre')
    expect(filas().map((a) => a.getAttribute('data-fila'))).toEqual(['c-ana', 'c-bru'])
    expect(direccion().get('orden')).toBe('nombre')
  })
})

describe('filtros de Contactos', () => {
  it('el buscador filtra (sin tildes) y el origen queda en la dirección', async () => {
    render(<ContactosLista inicial={datos()} propios={false} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'angela')
    await waitFor(() => expect(filas().map((a) => a.getAttribute('data-fila'))).toEqual(['c-ana']))
    expect(direccion().get('q')).toBe('angela')
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar' }))
    await waitFor(() => expect(filas()).toHaveLength(2))
    await userEvent.selectOptions(screen.getAllByLabelText('Origen')[0], 'embudo')
    expect(direccion().get('origen')).toBe('embudo')
    expect(filas().map((a) => a.getAttribute('data-fila'))).toEqual(['c-bru'])
  })

  it('"Ningún contacto coincide con estos filtros" con "Limpiar filtros", que vacía también el buscador', async () => {
    irA('q=nadie')
    render(<ContactosLista inicial={datos()} propios={false} />)
    expect(screen.getByText('Ningún contacto coincide con estos filtros')).toBeInTheDocument()
    // Con el buscador como único filtro, "Limpiar filtros" igual aparece.
    expect(screen.getByRole('button', { name: 'Sacar el filtro Busca: «nadie»' })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0])
    expect(direccion().get('q')).toBeNull()
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('')
    expect(filas()).toHaveLength(2)
  })
})

describe('Contactos que no pudieron cargarse', () => {
  it('nunca dice "Sin contactos": dice que no se pudo, con "Reintentar"', () => {
    render(<ContactosLista inicial={null} propios={false} />)
    expect(screen.getByText('No se pudo cargar la lista de contactos')).toBeInTheDocument()
    expect(screen.queryByText(/Sin contactos/)).toBeNull()
    expect(screen.queryByText(/Ningún contacto coincide/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Con proceso abierto' })).toBeInTheDocument()
  })

  it('con un filtro puesto tampoco culpa al filtro, y el filtro sigue puesto', () => {
    irA('origen=referido')
    render(<ContactosLista inicial={null} propios={false} />)
    expect(screen.getByText('No se pudo cargar la lista de contactos')).toBeInTheDocument()
    expect(screen.queryByText(/Ningún contacto coincide/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Sacar el filtro Origen: Referido' })).toBeInTheDocument()
  })

  it('"Reintentar" vuelve a pedir la lista y la pantalla se recupera (el error no queda pegado)', async () => {
    const pedidos: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      pedidos.push(url)
      return new Response(JSON.stringify(datos()), { status: 200 })
    }))
    render(<ContactosLista inicial={null} propios={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(filas()).toHaveLength(2))
    expect(pedidos).toEqual(['/api/crm/contactos'])
    expect(screen.queryByText('No se pudo cargar la lista de contactos')).toBeNull()
  })

  it('si el reintento también falla, sigue diciendo que no se pudo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>504</html>', { status: 504 })))
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ContactosLista inicial={null} propios={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText('No se pudo cargar la lista de contactos')
    consola.mockRestore()
  })
})

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyDetailsEditor } from './PropertyDetailsEditor'

const valores = {
  property_type: 'ph',
  operation_type: 'venta',
  asking_price: 63000,
  currency: 'USD',
  commission_percentage: 3,
  contract_start_date: '2026-08-21',
  contract_end_date: '2026-11-21',
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: 0,
  covered_area: 49, total_area: 105, age: 50, floor: null, expensas: null,
  description: 'PH 3 ambientes',
}

function mockFetch(r: { ok: boolean; body?: unknown } = { ok: true }) {
  const fn = vi.fn().mockResolvedValue({
    ok: r.ok, status: r.ok ? 200 : 409, json: async () => r.body ?? { success: true },
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
const cuerpos = (fn: ReturnType<typeof mockFetch>) =>
  fn.mock.calls.map(c => JSON.parse((c[1] as { body: string }).body))

async function abrir(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /modificar ficha/i }))
}

beforeEach(() => vi.unstubAllGlobals())

describe('el panel es UNA sola puerta para toda la ficha', () => {
  it('el botón dice "Modificar ficha" y abre el panel', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    expect(screen.getByLabelText(/^tipo$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/operación/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^precio$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/comisión/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/ambientes/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/inicio de contrato/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument()
  })

  it('cambiar el tipo se guarda solo', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    await user.selectOptions(screen.getByLabelText(/^tipo$/i), 'casa')
    await waitFor(() => expect(cuerpos(fetchMock)).toEqual([{ property_type: 'casa' }]))
  })

  it('cambiar la operación se guarda sola', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    await user.selectOptions(screen.getByLabelText(/operación/i), 'alquiler')
    await waitFor(() => expect(cuerpos(fetchMock)).toEqual([{ operation_type: 'alquiler' }]))
  })

  it('una característica se guarda al salir del campo', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    const amb = screen.getByLabelText(/ambientes/i)
    await user.clear(amb); await user.type(amb, '4'); await user.tab()
    await waitFor(() => expect(cuerpos(fetchMock)).toEqual([{ rooms: 4 }]))
  })

  it('la comisión y las fechas de contrato también se editan', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    const com = screen.getByLabelText(/comisión/i)
    await user.clear(com); await user.type(com, '4'); await user.tab()
    await waitFor(() => expect(cuerpos(fetchMock)).toEqual([{ commission_percentage: 4 }]))
  })

  it('NO guarda mientras se tipea', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    await user.type(screen.getByLabelText(/dormitorios/i), '5')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('el precio conserva sus protecciones dentro del panel', () => {
  it('el precio se ve agrupado en miles', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    expect(screen.getByLabelText(/^precio$/i)).toHaveValue('63.000')
  })

  it('una baja normal se guarda sin molestar', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    const precio = screen.getByLabelText(/^precio$/i)
    await user.clear(precio); await user.type(precio, '60000'); await user.tab()
    await waitFor(() => expect(cuerpos(fetchMock)).toEqual([{ asking_price: 60000 }]))
  })

  it('un precio a medio tipear pide confirmación y BLOQUEA el campo', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    const precio = screen.getByLabelText(/^precio$/i)
    await user.clear(precio); await user.type(precio, '6'); await user.tab()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText(/^precio$/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /^confirmar/i })).toHaveTextContent(/US\$\s?6/)
  })

  it('cancelar restaura el precio publicado', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    const precio = screen.getByLabelText(/^precio$/i)
    await user.clear(precio); await user.type(precio, '6'); await user.tab()
    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^precio$/i)).toHaveValue('63.000')
    expect(screen.getByLabelText(/^precio$/i)).not.toBeDisabled()
  })

  it('confirmar manda el flag que el servidor exige', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    const precio = screen.getByLabelText(/^precio$/i)
    await user.clear(precio); await user.type(precio, '6'); await user.tab()
    await user.click(screen.getByRole('button', { name: /^confirmar/i }))
    await waitFor(() => expect(cuerpos(fetchMock)).toEqual([{ asking_price: 6, confirmar: true }]))
  })

  it('cambiar la moneda pide confirmación', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    await user.selectOptions(screen.getByLabelText(/moneda/i), 'ARS')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('un 409 del servidor ofrece confirmar en vez de dejar un error sin salida', async () => {
    const fetchMock = mockFetch({
      ok: false,
      body: { error: 'El aviso pasa de US$ 63.000 a US$ 40.000.', requiereConfirmacion: true },
    })
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    const precio = screen.getByLabelText(/^precio$/i)
    await user.clear(precio); await user.type(precio, '58000'); await user.tab()
    await waitFor(() => expect(screen.getByRole('button', { name: /^confirmar/i })).toBeInTheDocument())
  })

  it('vaciar el precio no lo borra', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrir(user)
    await user.clear(screen.getByLabelText(/^precio$/i))
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^precio$/i)).toHaveValue('63.000')
  })
})

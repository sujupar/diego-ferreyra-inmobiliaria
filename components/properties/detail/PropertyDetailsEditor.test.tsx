// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyDetailsEditor } from './PropertyDetailsEditor'

const valores = {
  rooms: 6, bedrooms: 6, bathrooms: 4, garages: 4,
  covered_area: 450, total_area: 520, age: 10, floor: null, expensas: null,
  description: 'Casa en Villa Devoto',
}

function mockFetch(respuesta: { ok: boolean; body?: unknown } = { ok: true }) {
  const fn = vi.fn().mockResolvedValue({
    ok: respuesta.ok,
    json: async () => respuesta.body ?? { success: true },
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

async function abrirPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /editar características/i }))
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.useRealTimers())

describe('PropertyDetailsEditor', () => {
  it('arranca cerrado y se abre con el botón', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    expect(screen.queryByLabelText('Ambientes')).not.toBeInTheDocument()
    await abrirPanel(user)
    expect(screen.getByLabelText('Ambientes')).toHaveValue(6)
    expect(screen.getByLabelText('Descripción')).toHaveValue('Casa en Villa Devoto')
  })

  it('guarda solo o al salir del campo, con el valor nuevo', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    const input = screen.getByLabelText('Dormitorios')
    await user.clear(input)
    await user.type(input, '5')
    await user.tab() // salir del campo fuerza el guardado sin esperar

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/properties/p1/details')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ bedrooms: 5 })
  })

  it('cada campo se guarda al dejarlo, con su propio valor', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    const banos = screen.getByLabelText('Baños')
    await user.clear(banos)
    await user.type(banos, '3')
    const cocheras = screen.getByLabelText('Cocheras') // el click acá saca el foco de Baños
    await user.click(cocheras)
    await user.clear(cocheras)
    await user.type(cocheras, '2')
    await user.tab()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const cuerpos = fetchMock.mock.calls.map(c => JSON.parse(c[1].body))
    expect(cuerpos).toContainEqual({ bathrooms: 3 })
    expect(cuerpos).toContainEqual({ garages: 2 })
  })

  it('NO guarda mientras se tipea: vaciar el campo para corregirlo no publica un dato en blanco', async () => {
    // Es la razón de que no haya guardado por temporizador: para pasar de 6 a 5
    // hay que vaciar el campo, y la landing lee estos valores en vivo.
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    const input = screen.getByLabelText('Dormitorios')
    await user.clear(input)
    await user.type(input, '5')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si el guardado falla, volver a salir del campo REINTENTA', async () => {
    const fetchMock = mockFetch({ ok: false, body: { error: 'No se pudo guardar el cambio.' } })
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    const input = screen.getByLabelText('Baños')
    await user.clear(input)
    await user.type(input, '3')
    await user.tab()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // Sin cambiar nada: entrar y salir otra vez tiene que volver a intentar,
    // porque el valor NO quedó guardado.
    await user.click(input)
    await user.tab()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('vaciar un campo lo borra (manda null), no lo pone en cero', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    await user.clear(screen.getByLabelText('Antigüedad'))
    await user.tab()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ age: null })
  })

  it('un valor inválido no viaja al servidor y se avisa nombrando el campo', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    const input = screen.getByLabelText('Ambientes')
    await user.clear(input)
    await user.type(input, '500')
    await user.tab()

    // El mensaje completo, no solo la palabra: "Ambientes" también es la
    // etiqueta del campo y una aserción laxa pasaría siempre.
    await waitFor(() =>
      expect(screen.getByText('Los ambientes tiene que estar entre 0 y 50.')).toBeInTheDocument(),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('muestra el error que devuelve el servidor', async () => {
    const fetchMock = mockFetch({ ok: false, body: { error: 'No se pudo guardar el cambio.' } })
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    await user.clear(screen.getByLabelText('Baños'))
    await user.type(screen.getByLabelText('Baños'), '2')
    await user.tab()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await screen.findByText(/no se pudo guardar/i)).toBeInTheDocument()
  })

  it('avisa que la landing se actualiza sola pero los textos de la IA no', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    expect(screen.getByText(/no se reescriben/i)).toBeInTheDocument()
  })

  it('siempre avisa que los portales no se actualizan solos', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={() => {}} />)
    await abrirPanel(user)
    expect(screen.getByText(/portales no se actualizan solos/i)).toBeInTheDocument()
  })

  it('refresca la ficha después de guardar', async () => {
    mockFetch()
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<PropertyDetailsEditor propertyId="p1" valores={valores} onChanged={onChanged} />)
    await abrirPanel(user)
    await user.clear(screen.getByLabelText('Baños'))
    await user.type(screen.getByLabelText('Baños'), '3')
    await user.tab()
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
})

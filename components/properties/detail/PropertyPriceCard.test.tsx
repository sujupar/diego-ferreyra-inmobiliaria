// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyPriceCard } from './PropertyPriceCard'

const base = {
  propertyId: 'p1',
  askingPrice: 1350000,
  currency: 'USD',
  onChanged: () => {},
}

function mockFetch(respuesta: { ok: boolean; body?: unknown } = { ok: true }) {
  const fn = vi.fn().mockResolvedValue({
    ok: respuesta.ok,
    json: async () => respuesta.body ?? { success: true },
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const confirmarBtn = () => screen.getByRole('button', { name: /^confirmar/i })
const cancelarBtn = () => screen.getByRole('button', { name: /cancelar/i })

beforeEach(() => vi.unstubAllGlobals())

describe('PropertyPriceCard — el precio a medio tipear NO llega a la landing', () => {
  it('escribir "12" y hacer clic afuera NO guarda: pide confirmación', async () => {
    // El escenario exacto que hay que impedir: el asesor escribe 1290000,
    // alcanza a poner "12" y se va del campo. La landing lee el precio en vivo,
    // así que sin este freno se publica US$ 12 con pauta encima.
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '12')
    await user.tab()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/US\$\s?12/)).toBeInTheDocument()
    expect(confirmarBtn()).toBeInTheDocument()
  })

  it('cancelar deja el precio como estaba y no toca la base', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '12')
    await user.tab()
    await user.click(cancelarBtn())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/precio/i)).toHaveValue(1350000)
    expect(screen.queryByRole('button', { name: /^confirmar/i })).not.toBeInTheDocument()
  })

  it('recién al confirmar se guarda, con el valor confirmado', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '900000')
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(confirmarBtn())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // `confirmar: true` es obligatorio: el servidor repite el freno y sin ese
    // flag devuelve 409. Confirmar en pantalla no alcanza por sí solo.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      asking_price: 900000, confirmar: true,
    })
  })

  it('un cambio normal viaja SIN el flag de confirmación', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '1290000')
    await user.tab()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('confirmar')
  })

  it('la confirmación muestra los dos precios y la magnitud del salto', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '135000')
    await user.tab()

    const aviso = screen.getByRole('alert')
    expect(aviso).toHaveTextContent('1.350.000')
    expect(aviso).toHaveTextContent('135.000')
    expect(aviso).toHaveTextContent(/baja del 90%/i)
  })

  it('un cero de más también se frena', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '13500000')
    await user.tab()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/suba/i)
  })
})

describe('PropertyPriceCard — la baja de precio real no molesta', () => {
  it('1.350.000 → 1.290.000 se guarda solo, sin confirmación', async () => {
    // Es el caso de uso que pidió el dueño: bajar el precio. No puede pedir
    // confirmación cada vez o el freno se vuelve ruido y se ignora.
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '1290000')
    await user.tab()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ asking_price: 1290000 })
    expect(screen.queryByRole('button', { name: /^confirmar/i })).not.toBeInTheDocument()
  })

  it('guarda con Enter', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '1300000{Enter}')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('no guarda si el valor no cambió', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.click(screen.getByLabelText(/precio/i))
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('PropertyPriceCard — moneda', () => {
  it('cambiar de dólares a pesos pide confirmación (el mismo número vale otra cosa)', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.selectOptions(screen.getByLabelText(/moneda/i), 'ARS')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(confirmarBtn()).toBeInTheDocument()
  })

  it('cancelar el cambio de moneda vuelve a la anterior', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.selectOptions(screen.getByLabelText(/moneda/i), 'ARS')
    await user.click(cancelarBtn())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/moneda/i)).toHaveValue('USD')
  })

  it('confirmar el cambio de moneda lo guarda', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.selectOptions(screen.getByLabelText(/moneda/i), 'ARS')
    await user.click(confirmarBtn())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ currency: 'ARS', confirmar: true })
  })
})

describe('PropertyPriceCard — validación y errores', () => {
  it('muestra el precio actual formateado', () => {
    mockFetch()
    render(<PropertyPriceCard {...base} />)
    expect(screen.getByDisplayValue('1350000')).toBeInTheDocument()
    expect(screen.getByText(/US\$\s?1\.350\.000/)).toBeInTheDocument()
  })

  it('NO guarda mientras se tipea', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(screen.getByLabelText(/precio/i))
    await user.type(screen.getByLabelText(/precio/i), '1290000')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un precio en cero no viaja al servidor ni pide confirmación: es inválido', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '0')
    await user.tab()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/mayor a cero/i)).toBeInTheDocument()
  })

  it('vaciar el campo no borra el precio', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(screen.getByLabelText(/precio/i))
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('muestra el error del servidor', async () => {
    const fetchMock = mockFetch({ ok: false, body: { error: 'Ese precio parece tener un cero de más. Revisalo.' } })
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '1300000')
    await user.tab()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/cero de más/i)).toBeInTheDocument()
  })

  it('avisa que los avisos de los portales no se actualizan solos', () => {
    mockFetch()
    render(<PropertyPriceCard {...base} />)
    expect(screen.getByText(/portales no se actualizan/i)).toBeInTheDocument()
  })
})

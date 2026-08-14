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

beforeEach(() => vi.unstubAllGlobals())

describe('PropertyPriceCard', () => {
  it('muestra el precio actual formateado', () => {
    mockFetch()
    render(<PropertyPriceCard {...base} />)
    expect(screen.getByDisplayValue('1350000')).toBeInTheDocument()
    expect(screen.getByText(/US\$\s?1\.350\.000/)).toBeInTheDocument()
  })

  it('NO guarda mientras se tipea: la landing es pública y mostraría un precio a medias', async () => {
    // El motivo de que este campo NO tenga autosave por tecla: escribir
    // "1290000" pasa por "1", "12", "129"… y cada uno se vería en la landing.
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(screen.getByLabelText(/precio/i))
    await user.type(screen.getByLabelText(/precio/i), '1290000')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('guarda al salir del campo', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '1290000')
    await user.tab()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/properties/p1/details')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ asking_price: 1290000 })
  })

  it('guarda con Enter', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '990000{Enter}')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ asking_price: 990000 })
  })

  it('no guarda si el valor no cambió', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.click(screen.getByLabelText(/precio/i))
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un precio inválido no viaja al servidor y se avisa', async () => {
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

  it('muestra el error del servidor', async () => {
    const fetchMock = mockFetch({ ok: false, body: { error: 'Ese precio parece tener un cero de más. Revisalo.' } })
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    const input = screen.getByLabelText(/precio/i)
    await user.clear(input)
    await user.type(input, '99000000')
    await user.tab()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/cero de más/i)).toBeInTheDocument()
  })

  it('cambiar la moneda guarda enseguida', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.selectOptions(screen.getByLabelText(/moneda/i), 'ARS')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ currency: 'ARS' })
  })

  it('avisa que los avisos de los portales no se actualizan solos', () => {
    mockFetch()
    render(<PropertyPriceCard {...base} />)
    expect(screen.getByText(/portales no se actualizan/i)).toBeInTheDocument()
  })
})

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyPriceCard } from './PropertyPriceCard'

const base = {
  propertyId: 'p1',
  askingPrice: 1350000,
  currency: 'USD',
  onChanged: () => {},
}

function mockFetch(respuesta: { ok: boolean; status?: number; body?: unknown } = { ok: true }) {
  const fn = vi.fn().mockResolvedValue({
    ok: respuesta.ok,
    status: respuesta.status ?? (respuesta.ok ? 200 : 400),
    json: async () => respuesta.body ?? { success: true },
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const precio = () => screen.getByLabelText(/precio/i)
const monedaSel = () => screen.getByLabelText(/moneda/i)
const btnConfirmar = () => screen.getByRole('button', { name: /^confirmar/i })
const btnCancelar = () => screen.getByRole('button', { name: /cancelar/i })
const hayPanel = () => screen.queryByRole('alert') !== null
const cuerpos = (fn: ReturnType<typeof mockFetch>) =>
  fn.mock.calls.map(c => JSON.parse((c[1] as { body: string }).body))

beforeEach(() => vi.unstubAllGlobals())

describe('el precio a medio tipear no llega a la landing', () => {
  it('el campo agrupa de a miles: "12" y "1.290.000" no se parecen', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    expect(precio()).toHaveValue('1.350.000')
    await user.clear(precio())
    await user.type(precio(), '1290000')
    expect(precio()).toHaveValue('1.290.000')
  })

  it('muestra en limpio lo que va a publicar antes de guardar', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '1290000')
    expect(screen.getByText(/Vas a publicar US\$\s?1\.290\.000/)).toBeInTheDocument()
  })

  it('escribir "12" y hacer clic afuera NO guarda: pide confirmación', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '12')
    await user.tab()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(btnConfirmar()).toBeInTheDocument()
  })

  it('CRÍTICO: con el cartel abierto el campo queda BLOQUEADO, así lo confirmado es lo que se ve', async () => {
    // El peor bug de la primera versión: el cartel congelaba el valor del blur,
    // pero el campo seguía editable. Corregir el número y apretar Confirmar
    // publicaba el valor VIEJO (US$ 12) — y el gesto es el más natural de todos.
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '12')
    await user.tab()

    expect(precio()).toBeDisabled()
    expect(monedaSel()).toBeDisabled()
    // El botón dice exactamente qué se va a publicar.
    expect(btnConfirmar()).toHaveTextContent(/US\$\s?12/)

    await user.type(precio(), '90000') // no entra: está bloqueado
    expect(precio()).toHaveValue('12')

    await user.click(btnConfirmar())
    expect(cuerpos(fetchMock)[0]).toEqual({ asking_price: 12, confirmar: true })
  })

  it('cancelar deja el precio como estaba y desbloquea el campo', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '12')
    await user.tab()
    await user.click(btnCancelar())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(precio()).toHaveValue('1.350.000')
    expect(precio()).not.toBeDisabled()
    expect(hayPanel()).toBe(false)
  })

  it('cancelar y volver a escribir el precio correcto funciona', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '12')
    await user.tab()
    await user.click(btnCancelar())

    await user.clear(precio())
    await user.type(precio(), '1290000')
    await user.tab()
    expect(cuerpos(fetchMock)).toEqual([{ asking_price: 1290000 }])
  })

  it('cada paso intermedio de tipear 1.290.000 pide confirmación', async () => {
    for (const parcial of ['1', '12', '129', '1290', '12900', '129000']) {
      const fetchMock = mockFetch()
      const user = userEvent.setup()
      const { unmount } = render(<PropertyPriceCard {...base} />)
      await user.clear(precio())
      await user.type(precio(), parcial)
      await user.tab()
      expect(fetchMock, `parcial ${parcial}`).not.toHaveBeenCalled()
      unmount()
    }
  })
})

describe('el estado de la tarjeta no se queda viejo', () => {
  it('CRÍTICO: si el precio cambia en la base, el campo se resincroniza', async () => {
    // Sin esto, el campo conservaba el valor con el que se montó: si otra
    // persona bajaba el precio, un clic adentro/afuera sin escribir nada
    // reescribía el viejo y revertía su cambio en silencio.
    mockFetch()
    const { rerender } = render(<PropertyPriceCard {...base} />)
    expect(precio()).toHaveValue('1.350.000')

    rerender(<PropertyPriceCard {...base} askingPrice={1200000} />)
    await waitFor(() => expect(precio()).toHaveValue('1.200.000'))
  })

  it('CRÍTICO: clic adentro y afuera sin escribir nada NO reescribe nada', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    const { rerender } = render(<PropertyPriceCard {...base} />)
    rerender(<PropertyPriceCard {...base} askingPrice={1200000} />)
    await waitFor(() => expect(precio()).toHaveValue('1.200.000'))

    await user.click(precio())
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('la baja de precio real no molesta', () => {
  it('1.350.000 → 1.290.000 se guarda solo, sin confirmación', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '1290000')
    await user.tab()

    expect(cuerpos(fetchMock)).toEqual([{ asking_price: 1290000 }])
    expect(hayPanel()).toBe(false)
  })

  it('guarda con Enter', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '1300000{Enter}')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('no guarda si el valor no cambió', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.click(precio())
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una propiedad en pesos se puede editar (el techo depende de la moneda)', async () => {
    // Con un techo único de 100M, una propiedad en pesos quedaba imposible de
    // editar: ni siquiera para BAJARLE el precio.
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} askingPrice={150_000_000} currency="ARS" />)
    await user.clear(precio())
    await user.type(precio(), '140000000')
    await user.tab()

    expect(cuerpos(fetchMock)).toEqual([{ asking_price: 140000000 }])
  })
})

describe('moneda', () => {
  it('cambiar de dólares a pesos pide confirmación mostrando los DOS precios', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.selectOptions(monedaSel(), 'ARS')

    expect(fetchMock).not.toHaveBeenCalled()
    const aviso = screen.getByRole('alert')
    expect(aviso).toHaveTextContent('US$')
    expect(aviso).toHaveTextContent('1.350.000')
  })

  it('cancelar el cambio de moneda vuelve a la anterior', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.selectOptions(monedaSel(), 'ARS')
    await user.click(btnCancelar())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(monedaSel()).toHaveValue('USD')
  })

  it('confirmar el cambio de moneda lo guarda', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.selectOptions(monedaSel(), 'ARS')
    await user.click(btnConfirmar())
    expect(cuerpos(fetchMock)).toEqual([{ currency: 'ARS', confirmar: true }])
  })

  it('cambiar precio Y moneda juntos viaja en UNA sola operación', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '1900000000')
    await user.selectOptions(monedaSel(), 'ARS')
    await user.click(btnConfirmar())

    expect(cuerpos(fetchMock)).toEqual([
      { asking_price: 1900000000, currency: 'ARS', confirmar: true },
    ])
  })
})

describe('el servidor puede pedir confirmación y la tarjeta la ofrece', () => {
  it('un 409 abre el cartel en vez de dejar un error sin salida', async () => {
    // La base puede haber cambiado bajo los pies: el cliente calcula 'directo'
    // y el servidor, contra el precio real, responde 409. Antes eso quedaba
    // como un texto rojo sin ningún botón y solo se salía recargando.
    const fetchMock = mockFetch({
      ok: false, status: 409,
      body: { error: 'El aviso pasa de US$ 900.000 a US$ 1.150.000: una suba del 27,8%.', requiereConfirmacion: true },
    })
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '1150000')
    await user.tab()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/27,8%/))
    expect(btnConfirmar()).toBeInTheDocument()
  })

  it('confirmar después del 409 reintenta con el flag y sale adelante', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false, status: 409,
        json: async () => ({ error: 'Necesita confirmación.', requiereConfirmacion: true }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '1150000')
    await user.tab()
    await waitFor(() => expect(btnConfirmar()).toBeInTheDocument())

    await user.click(btnConfirmar())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(cuerpos(fetchMock)[1]).toEqual({ asking_price: 1150000, confirmar: true })
  })
})

describe('validación y avisos', () => {
  it('vaciar el campo no borra el precio: se restaura el publicado', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(precio()).toHaveValue('1.350.000')
  })

  it('escribir cero no viaja al servidor', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '0')
    await user.tab()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('muestra el error del servidor cuando no es un pedido de confirmación', async () => {
    mockFetch({ ok: false, status: 500, body: { error: 'No se pudo guardar el cambio.' } })
    const user = userEvent.setup()
    render(<PropertyPriceCard {...base} />)
    await user.clear(precio())
    await user.type(precio(), '1300000')
    await user.tab()
    expect(await screen.findByText(/no se pudo guardar/i)).toBeInTheDocument()
  })

  it('avisa que los avisos de los portales no se actualizan solos', () => {
    mockFetch()
    render(<PropertyPriceCard {...base} />)
    expect(screen.getByText(/portales no se actualizan/i)).toBeInTheDocument()
  })
})

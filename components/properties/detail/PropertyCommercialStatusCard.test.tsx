// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyCommercialStatusCard } from './PropertyCommercialStatusCard'

const base = {
  propertyId: 'p1', currency: 'USD',
  soldPrice: null as number | null, soldCurrency: null as string | null, soldAt: null as string | null,
  onChanged: () => {},
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

describe('PropertyCommercialStatusCard', () => {
  it('muestra el estado actual y su explicación', () => {
    render(<PropertyCommercialStatusCard {...base} current="disponible" />)
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText(/comercialización activa/i)).toBeInTheDocument()
  })

  it('ofrece los otros cuatro estados, no el actual', () => {
    render(<PropertyCommercialStatusCard {...base} current="disponible" />)
    expect(screen.getByRole('button', { name: /^reservada$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^vendida$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dada de baja$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^descartada$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^disponible$/i })).not.toBeInTheDocument()
  })

  it('al elegir vendida pide precio real y fecha', async () => {
    const user = userEvent.setup()
    render(<PropertyCommercialStatusCard {...base} current="disponible" />)
    await user.click(screen.getByRole('button', { name: /^vendida$/i }))
    expect(screen.getByLabelText(/precio real/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/fecha de la operación/i)).toBeInTheDocument()
  })

  // OJO: el texto que se busca es el del ERROR, no el de la etiqueta del campo.
  // "precio real" y "motivo" ya están en pantalla como labels: buscarlos no
  // probaría nada.
  it('no deja confirmar una venta sin precio y explica por qué', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<PropertyCommercialStatusCard {...base} current="disponible" />)
    await user.click(screen.getByRole('button', { name: /^vendida$/i }))
    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    expect(await screen.findByText(/necesitás cargar el precio real/i)).toBeInTheDocument()
    // Y no llegó a llamar a la ruta: solo se pidió el historial al montar.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('salir de vendida sin motivo no guarda y explica por qué', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<PropertyCommercialStatusCard {...base} current="vendida" soldPrice={180000} soldCurrency="USD" soldAt="2026-08-01" />)
    await user.click(screen.getByRole('button', { name: /^disponible$/i }))
    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    expect(await screen.findByText(/necesitás escribir el motivo/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un cambio válido llama a la ruta y avisa al padre', async () => {
    const onChanged = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: [] }) })   // historial inicial
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })      // POST
      .mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })        // historial recargado
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<PropertyCommercialStatusCard {...base} current="disponible" onChanged={onChanged} />)
    await user.click(screen.getByRole('button', { name: /^reservada$/i }))
    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/properties/p1/commercial-status',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('cuando está vendida muestra el precio real cargado', () => {
    render(<PropertyCommercialStatusCard {...base} current="vendida" soldPrice={180000} soldCurrency="USD" soldAt="2026-08-01" />)
    expect(screen.getByText(/180\.000/)).toBeInTheDocument()
  })
})

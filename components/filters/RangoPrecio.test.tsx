// @vitest-environment happy-dom
/**
 * Rango de precio de los listados.
 *
 * Lo importante: que "150.000" signifique ciento cincuenta mil (y no ciento
 * cincuenta), que escribir no dispare un pedido por tecla, y que mover una
 * punta no borre la otra.
 */
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RangoPrecio } from './RangoPrecio'

// Sin temporizadores simulados — ver la nota en BusquedaTexto.test.tsx.
const usuario = () => userEvent.setup()
/** Más de lo que dura cualquier prueba: solo aplica el camino instantáneo. */
const NUNCA = 100_000
/** Corta como para esperarla con `waitFor`. */
const YA = 10

const desde = () => screen.getByLabelText(/precio desde/i)
const hasta = () => screen.getByLabelText(/precio hasta/i)

describe('RangoPrecio', () => {
  it('muestra los valores que le llegan', () => {
    render(<RangoPrecio value={{ min: '100000', max: '300000' }} onChange={() => {}} />)
    expect(desde()).toHaveValue('100000')
    expect(hasta()).toHaveValue('300000')
  })

  it('dice que el rango es en dolares', () => {
    render(<RangoPrecio value={{ min: '', max: '' }} onChange={() => {}} />)
    expect(screen.getByText(/US\$/)).toBeInTheDocument()
  })

  it('escribir no avisa en el acto', async () => {
    const avisar = vi.fn()
    render(<RangoPrecio value={{ min: '', max: '' }} onChange={avisar} esperaMs={NUNCA} />)
    await usuario().type(desde(), '100000')
    expect(avisar).not.toHaveBeenCalled()
  })

  it('entiende el punto de miles argentino', async () => {
    const avisar = vi.fn()
    render(<RangoPrecio value={{ min: '', max: '' }} onChange={avisar} esperaMs={YA} />)
    await usuario().type(desde(), '150.000')
    await waitFor(() => expect(avisar).toHaveBeenCalledWith({ min: '150000', max: '' }))
  })

  it('mover una punta conserva la otra', async () => {
    const avisar = vi.fn()
    render(<RangoPrecio value={{ min: '100000', max: '' }} onChange={avisar} esperaMs={YA} />)
    await usuario().type(hasta(), '300000')
    await waitFor(() => expect(avisar).toHaveBeenCalledWith({ min: '100000', max: '300000' }))
  })

  it('Enter aplica al instante', async () => {
    const avisar = vi.fn()
    render(<RangoPrecio value={{ min: '', max: '' }} onChange={avisar} esperaMs={NUNCA} />)
    const u = usuario()
    await u.type(desde(), '100000')
    await u.keyboard('{Enter}')
    expect(avisar).toHaveBeenCalledWith({ min: '100000', max: '' })
  })

  it('avisa cuando el desde es mayor que el hasta', () => {
    render(<RangoPrecio value={{ min: '300000', max: '100000' }} onChange={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent(/mayor/i)
  })

  it('no avisa con el rango bien puesto', () => {
    render(<RangoPrecio value={{ min: '100000', max: '300000' }} onChange={() => {}} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('un cambio de AFUERA se refleja en los campos', () => {
    const { rerender } = render(<RangoPrecio value={{ min: '100000', max: '300000' }} onChange={() => {}} />)
    rerender(<RangoPrecio value={{ min: '', max: '' }} onChange={() => {}} />)
    expect(desde()).toHaveValue('')
    expect(hasta()).toHaveValue('')
  })
})

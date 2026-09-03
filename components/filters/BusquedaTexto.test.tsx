// @vitest-environment happy-dom
/**
 * Campo de búsqueda de los listados.
 *
 * Se prueba lo que hace que el buscador se sienta bien o mal: que escribir NO
 * dispare un pedido por tecla, que Enter no obligue a esperar, y que el campo
 * no se pelee con lo que la persona está tipeando.
 *
 * NOTA SOBRE LOS TIEMPOS: acá NO se usan temporizadores simulados. Con
 * `vi.useFakeTimers()`, cualquier interacción de `user-event` —hasta un clic—
 * se queda esperando un temporizador que nadie adelanta y la prueba muere en el
 * límite de 5 s. En vez de pelear con eso, la espera del componente se ajusta
 * por prop (`esperaMs`): larguísima cuando hay que probar que NO pasa nada,
 * cortísima cuando hay que esperar a que pase.
 */
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BusquedaTexto } from './BusquedaTexto'

const usuario = () => userEvent.setup()
/** Más de lo que dura cualquier prueba: solo puede aplicar el camino instantáneo. */
const NUNCA = 100_000
/** Suficientemente corta como para esperarla con `waitFor`. */
const YA = 10

describe('BusquedaTexto', () => {
  it('muestra el valor que le llega', () => {
    render(<BusquedaTexto value="almagro" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('almagro')
  })

  it('escribir no avisa en el acto — no un pedido por tecla', async () => {
    const avisar = vi.fn()
    render(<BusquedaTexto value="" onChange={avisar} esperaMs={NUNCA} />)
    await usuario().type(screen.getByRole('searchbox'), 'alma')
    expect(screen.getByRole('searchbox')).toHaveValue('alma')
    expect(avisar).not.toHaveBeenCalled()
  })

  it('avisa UNA sola vez, con lo ultimo escrito', async () => {
    const avisar = vi.fn()
    render(<BusquedaTexto value="" onChange={avisar} esperaMs={YA} />)
    await usuario().type(screen.getByRole('searchbox'), 'alma')
    await waitFor(() => expect(avisar).toHaveBeenCalledTimes(1))
    expect(avisar).toHaveBeenCalledWith('alma')
  })

  it('Enter aplica al instante, sin esperar', async () => {
    const avisar = vi.fn()
    render(<BusquedaTexto value="" onChange={avisar} esperaMs={NUNCA} />)
    const u = usuario()
    await u.type(screen.getByRole('searchbox'), 'almagro')
    await u.keyboard('{Enter}')
    expect(avisar).toHaveBeenCalledWith('almagro')
  })

  it('el boton de limpiar solo aparece si hay algo escrito', () => {
    const { rerender } = render(<BusquedaTexto value="" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /limpiar/i })).not.toBeInTheDocument()
    rerender(<BusquedaTexto value="almagro" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeInTheDocument()
  })

  it('limpiar vacia el campo y avisa al instante', async () => {
    const avisar = vi.fn()
    render(<BusquedaTexto value="almagro" onChange={avisar} esperaMs={NUNCA} />)
    await usuario().click(screen.getByRole('button', { name: /limpiar/i }))
    expect(avisar).toHaveBeenCalledWith('')
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('un cambio de AFUERA se refleja en el campo', () => {
    // Pasa con "Limpiar todo", con el boton atras del navegador y con un link
    // compartido. Sin esto el campo seguiria mostrando un filtro que ya no rige.
    const { rerender } = render(<BusquedaTexto value="almagro" onChange={() => {}} />)
    rerender(<BusquedaTexto value="" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('el valor que vuelve del padre NO pisa lo que se sigue escribiendo', async () => {
    // Secuencia real: escribo "alma", se aplica, la direccion cambia a "alma" y
    // vuelve como prop MIENTRAS yo ya escribi "almagro". Si esa vuelta pisara el
    // campo, se comeria las letras nuevas.
    const avisar = vi.fn()
    const { rerender } = render(<BusquedaTexto value="" onChange={avisar} esperaMs={YA} />)
    const u = usuario()
    const campo = screen.getByRole('searchbox')
    await u.type(campo, 'alma')
    await waitFor(() => expect(avisar).toHaveBeenCalledWith('alma'))
    await u.type(campo, 'gro')
    rerender(<BusquedaTexto value="alma" onChange={avisar} esperaMs={YA} />)
    expect(campo).toHaveValue('almagro')
  })

  it('no avisa de nuevo si el texto no cambio', async () => {
    // Escribir una letra y borrarla no puede costar un pedido al servidor.
    const avisar = vi.fn()
    render(<BusquedaTexto value="alma" onChange={avisar} esperaMs={YA} />)
    const u = usuario()
    const campo = screen.getByRole('searchbox')
    await u.type(campo, 'x')
    await u.keyboard('{Backspace}')
    await new Promise(r => setTimeout(r, YA * 6))
    expect(avisar).not.toHaveBeenCalled()
  })
})

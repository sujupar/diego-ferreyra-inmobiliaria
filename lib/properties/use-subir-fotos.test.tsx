// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSubirFotos } from './use-subir-fotos'

/**
 * Sonda mínima: monta los dos inputs del hook, como hacen la ficha y la galería.
 * Los `data-testid` son del test — el hook no los impone.
 */
function Sonda() {
  const subida = useSubirFotos('prop-1', () => {})
  return (
    <>
      <input data-testid="galeria" {...subida.inputProps} />
      <input data-testid="camara" {...subida.inputPropsCamara} />
      <button onClick={subida.abrirSelector}>Elegir</button>
      <button onClick={subida.abrirCamara}>Sacar foto</button>
    </>
  )
}

describe('useSubirFotos', () => {
  it('el input de cámara pide la cámara TRASERA y una sola foto', () => {
    render(<Sonda />)
    const camara = screen.getByTestId('camara')

    // `environment` = la de atrás. Sin esto iOS abre la frontal, que para
    // fotografiar una propiedad no sirve.
    expect(camara).toHaveAttribute('capture', 'environment')
    expect(camara).toHaveAttribute('accept', 'image/*')
    // `capture` anula `multiple`: declararlo sería mentirle al que lea el código.
    expect(camara).not.toHaveAttribute('multiple')
  })

  it('el input de galería sigue aceptando varias fotos y NO fuerza la cámara', () => {
    render(<Sonda />)
    const galeria = screen.getByTestId('galeria')

    expect(galeria).toHaveAttribute('multiple')
    expect(galeria).not.toHaveAttribute('capture')
  })

  it('cada botón abre SU propio input', async () => {
    const user = userEvent.setup()
    render(<Sonda />)
    const galeria = screen.getByTestId('galeria') as HTMLInputElement
    const camara = screen.getByTestId('camara') as HTMLInputElement
    const clickGaleria = vi.spyOn(galeria, 'click').mockImplementation(() => {})
    const clickCamara = vi.spyOn(camara, 'click').mockImplementation(() => {})

    await user.click(screen.getByRole('button', { name: 'Sacar foto' }))
    expect(clickCamara).toHaveBeenCalledTimes(1)
    expect(clickGaleria).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Elegir' }))
    expect(clickGaleria).toHaveBeenCalledTimes(1)
    expect(clickCamara).toHaveBeenCalledTimes(1)
  })
})

// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InterruptorGeneral } from './InterruptorGeneral'

const base = { privados: false, reelsActivos: { prueba: 1, en_vivo: 0 } }

describe('InterruptorGeneral', () => {
  it('muestra si está encendida o apagada', () => {
    const { rerender } = render(<InterruptorGeneral {...base} prendida puedeCambiar onCambiar={async () => {}} />)
    expect(screen.getByText('Encendida')).toBeTruthy()
    rerender(<InterruptorGeneral {...base} prendida={false} puedeCambiar onCambiar={async () => {}} />)
    expect(screen.getByText('Apagada')).toBeTruthy()
  })

  it('sin permiso se ve el estado pero no el interruptor', () => {
    render(<InterruptorGeneral {...base} prendida puedeCambiar={false} onCambiar={async () => {}} />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText(/Solo el admin o el dueño/)).toBeTruthy()
  })

  it('encender pide confirmación y dice cuántos reels empiezan a responder', async () => {
    const onCambiar = vi.fn(async () => {})
    render(<InterruptorGeneral {...base} prendida={false} puedeCambiar onCambiar={onCambiar} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onCambiar).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog').textContent).toMatch(/1 reel en Modo prueba/)
    fireEvent.click(screen.getByRole('button', { name: /Sí, encender/ }))
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith(true))
  })

  it('cancelar no enciende nada', () => {
    const onCambiar = vi.fn(async () => {})
    render(<InterruptorGeneral {...base} prendida={false} puedeCambiar onCambiar={onCambiar} />)
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
    expect(onCambiar).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('apagar es inmediato: frenar nunca cuesta un clic de más', async () => {
    const onCambiar = vi.fn(async () => {})
    render(<InterruptorGeneral {...base} prendida puedeCambiar onCambiar={onCambiar} />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith(false))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('si el servidor rechaza, se ve el motivo', async () => {
    const onCambiar = vi.fn(async () => { throw new Error('Solo el admin o el dueño pueden cambiar la automatización general.') })
    render(<InterruptorGeneral {...base} prendida puedeCambiar onCambiar={onCambiar} />)
    fireEvent.click(screen.getByRole('switch'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Solo el admin/)
  })
})

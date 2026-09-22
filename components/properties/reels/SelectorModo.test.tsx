// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelectorModo } from './SelectorModo'

const base = { landingPublicada: true, hayPalabras: true, automatizacionGeneral: true }

describe('SelectorModo', () => {
  it('muestra las tres opciones y marca la actual', () => {
    render(<SelectorModo valor="prueba" onCambiar={() => {}} {...base} />)
    expect(screen.getByRole('radio', { name: /Modo prueba/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Apagado/ }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: /En vivo/ })).toBeTruthy()
  })

  it('pasar a Modo prueba no pide confirmación', () => {
    const onCambiar = vi.fn()
    render(<SelectorModo valor="apagado" onCambiar={onCambiar} {...base} />)
    fireEvent.click(screen.getByRole('radio', { name: /Modo prueba/ }))
    expect(onCambiar).toHaveBeenCalledWith('prueba')
  })

  it('En vivo NO cambia con un clic: pide confirmación primero', () => {
    const onCambiar = vi.fn()
    render(<SelectorModo valor="prueba" onCambiar={onCambiar} {...base} />)
    fireEvent.click(screen.getByRole('radio', { name: /En vivo/ }))
    expect(onCambiar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Sí, pasar a En vivo/ }))
    expect(onCambiar).toHaveBeenCalledWith('en_vivo')
  })

  it('arrepentirse de En vivo deja todo como estaba', () => {
    const onCambiar = vi.fn()
    render(<SelectorModo valor="prueba" onCambiar={onCambiar} {...base} />)
    fireEvent.click(screen.getByRole('radio', { name: /En vivo/ }))
    fireEvent.click(screen.getByRole('button', { name: /No, dejarlo como está/ }))
    expect(onCambiar).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Sí, pasar a En vivo/ })).toBeNull()
  })

  it('sin landing no deja prender, pero sí apagar', () => {
    const onCambiar = vi.fn()
    render(<SelectorModo valor="prueba" onCambiar={onCambiar} {...base} landingPublicada={false} />)
    expect((screen.getByRole('radio', { name: /En vivo/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Apagado/ }))
    expect(onCambiar).toHaveBeenCalledWith('apagado')
  })

  it('con el interruptor general apagado avisa que no va a responder todavía', () => {
    render(<SelectorModo valor="prueba" onCambiar={() => {}} {...base} automatizacionGeneral={false} />)
    expect(screen.getByRole('status').textContent).toMatch(/automatización general está apagada/)
  })
})

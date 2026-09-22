// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CampoPalabras, palabrasSonValidas } from './CampoPalabras'

describe('CampoPalabras', () => {
  it('muestra la lista como la va a entender el sistema: sin repetidas ni vacías', () => {
    render(<CampoPalabras id="x" valor="parque rivadavia, doblas, DOBLAS, , info" onCambiar={() => {}} />)
    const etiquetas = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(etiquetas).toEqual(['PARQUE RIVADAVIA · en la descripción', 'doblas', 'info'])
  })

  it('en un reel ya publicado no dice que la primera va en la descripción', () => {
    // La descripción de un reel enganchado está en Instagram y no se toca:
    // decirlo sería falso.
    render(<CampoPalabras id="x" valor="parque rivadavia, doblas" onCambiar={() => {}} conDescripcion={false} />)
    expect(screen.queryByText(/en la descripción/)).toBeNull()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['parque rivadavia', 'doblas'])
  })

  it('avisa antes de guardar cuando son más de 10', () => {
    const once = Array.from({ length: 11 }, (_, i) => `p${i}`).join(', ')
    render(<CampoPalabras id="x" valor={once} onCambiar={() => {}} />)
    expect(screen.getByRole('alert').textContent).toMatch(/10 palabras/)
  })

  it('le avisa al diálogo lo que escribe la persona', () => {
    const onCambiar = vi.fn()
    render(<CampoPalabras id="x" valor="" onCambiar={onCambiar} />)
    fireEvent.change(screen.getByLabelText(/palabras que activan la respuesta/i), { target: { value: 'doblas' } })
    expect(onCambiar).toHaveBeenCalledWith('doblas')
  })

  it('vacío no muestra etiquetas ni error', () => {
    render(<CampoPalabras id="x" valor="" onCambiar={() => {}} />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('palabrasSonValidas', () => {
  it('usa la misma regla que el servidor', () => {
    expect(palabrasSonValidas('doblas, info')).toBe(true)
    expect(palabrasSonValidas('')).toBe(true)
    expect(palabrasSonValidas(Array.from({ length: 11 }, (_, i) => `p${i}`).join(', '))).toBe(false)
  })
})

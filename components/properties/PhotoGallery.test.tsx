// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoGallery } from './PhotoGallery'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() }),
}))

const fotos = ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg', 'https://x/d.jpg']

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})

function abrirVisor() {
  render(<PhotoGallery propertyId="p1" photos={fotos} onChanged={() => {}} />)
  fireEvent.click(screen.getByAltText('Foto 1'))
  return screen.getByTestId('visor-fotos')
}

describe('PhotoGallery — controles con el dedo', () => {
  it('el botón de borrar se VE en táctil (antes solo aparecía con el mouse encima)', () => {
    render(<PhotoGallery propertyId="p1" photos={fotos} onChanged={() => {}} />)
    const borrar = screen.getByRole('button', { name: 'Eliminar foto 1' })

    // `opacity-0` a secas era el bug: invisible en el teléfono pero igual tocable.
    expect(borrar.className).toContain('opacity-100')
    expect(borrar.className).toContain('md:opacity-0')
    expect(borrar.className).not.toMatch(/(^|\s)opacity-0(\s|$)/)
  })

  it('borrar y reordenar llegan a 44px en el teléfono, y en esquinas opuestas', () => {
    render(<PhotoGallery propertyId="p1" photos={fotos} onChanged={() => {}} />)
    const borrar = screen.getByRole('button', { name: 'Eliminar foto 1' })
    const asa = screen.getByRole('button', { name: 'Reordenar foto 1' })

    expect(borrar.className).toContain('max-md:h-11')
    expect(borrar.className).toContain('max-md:w-11')
    expect(asa.className).toContain('max-md:h-11')
    expect(asa.className).toContain('max-md:w-11')
    // A 320px la miniatura mide ~103px de alto: los dos a la derecha quedaban
    // pegados. El asa se cruza a la izquierda solo en el teléfono.
    expect(asa.className).toContain('max-md:left-1.5')
    expect(asa.className).toContain('max-md:right-auto')
    expect(borrar.className).toContain('right-1.5')
  })

  it('el asa deja scrollear la página en el teléfono (el arrastre es por pulsación larga)', () => {
    render(<PhotoGallery propertyId="p1" photos={fotos} onChanged={() => {}} />)
    const asa = screen.getByRole('button', { name: 'Reordenar foto 1' })
    // Con `touch-none` en el celular, media pantalla dejaría de scrollear.
    expect(asa.className).toContain('max-md:touch-auto')
  })

  it('ofrece sacar una foto con la cámara, además de elegir de la galería', async () => {
    const { container } = render(<PhotoGallery propertyId="p1" photos={fotos} onChanged={() => {}} />)

    expect(screen.getByRole('button', { name: /sacar foto/i })).toBeInTheDocument()
    const camara = container.querySelector('input[capture]')
    expect(camara).toBeTruthy()
    expect(camara).toHaveAttribute('capture', 'environment')
    expect(camara).toHaveAttribute('accept', 'image/*')
  })
})

describe('PhotoGallery — visor a pantalla completa', () => {
  it('deslizar hacia la izquierda pasa a la foto siguiente', () => {
    const visor = abrirVisor()
    expect(screen.getByText('1 / 4')).toBeInTheDocument()

    fireEvent.touchStart(visor, { touches: [{ clientX: 300, clientY: 200 }] })
    fireEvent.touchEnd(visor, { changedTouches: [{ clientX: 100, clientY: 205 }] })

    expect(screen.getByText('2 / 4')).toBeInTheDocument()
  })

  it('deslizar hacia la derecha vuelve a la anterior, dando la vuelta', () => {
    const visor = abrirVisor()

    fireEvent.touchStart(visor, { touches: [{ clientX: 100, clientY: 200 }] })
    fireEvent.touchEnd(visor, { changedTouches: [{ clientX: 300, clientY: 200 }] })

    expect(screen.getByText('4 / 4')).toBeInTheDocument()
  })

  it('deslizar NO cierra el visor (el gesto emite un clic sintético al soltar)', () => {
    const visor = abrirVisor()

    fireEvent.touchStart(visor, { touches: [{ clientX: 300, clientY: 200 }] })
    fireEvent.touchEnd(visor, { changedTouches: [{ clientX: 100, clientY: 200 }] })
    fireEvent.click(visor) // el que dispara el navegador después del gesto

    expect(screen.getByTestId('visor-fotos')).toBeInTheDocument()
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
  })

  it('un toque sobre el fondo sí cierra', async () => {
    const user = userEvent.setup()
    const visor = abrirVisor()

    fireEvent.touchStart(visor, { touches: [{ clientX: 200, clientY: 200 }] })
    fireEvent.touchEnd(visor, { changedTouches: [{ clientX: 203, clientY: 202 }] })
    await user.click(visor)

    expect(screen.queryByTestId('visor-fotos')).not.toBeInTheDocument()
  })

  it('dice en qué foto está y usa `dvh` para no pasarse de pantalla en iOS', () => {
    abrirVisor()
    expect(screen.getByText('1 / 4')).toBeInTheDocument()
    expect(screen.getByAltText('Foto 1 de 4').className).toContain('max-h-[90dvh]')
  })

  it('las flechas y el cierre tienen nombre y área táctil', () => {
    abrirVisor()
    for (const nombre of ['Foto anterior', 'Foto siguiente', 'Cerrar']) {
      const boton = screen.getByRole('button', { name: nombre })
      expect(boton.className).toContain('tap')
    }
  })
})

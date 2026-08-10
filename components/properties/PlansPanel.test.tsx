// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { PlansPanel } from './PlansPanel'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() }),
}))

const planos = ['https://x/property-files/properties/p1/plans/abc-Planta%20baja.pdf']

describe('PlansPanel', () => {
  it('el selector declara tipos MIME, no solo extensiones', () => {
    const { container } = render(<PlansPanel propertyId="p1" plans={[]} onChanged={() => {}} />)
    const accept = container.querySelector('input[multiple]')!.getAttribute('accept')!

    // Con SOLO extensiones, iOS abre el explorador de Archivos y no ofrece ni la
    // cámara ni el carrete.
    expect(accept).toContain('application/pdf')
    expect(accept).toContain('image/*')
    // Las extensiones siguen: `validatePlanFile` valida por extensión.
    expect(accept).toContain('.pdf')
    expect(accept).toContain('.heic')
  })

  it('deja fotografiar un plano en papel desde el teléfono', () => {
    const { container } = render(<PlansPanel propertyId="p1" plans={[]} onChanged={() => {}} />)
    const camara = container.querySelector('input[capture]')!

    expect(camara).toHaveAttribute('capture', 'environment')
    expect(camara).toHaveAttribute('accept', 'image/*')
    expect(screen.getByRole('button', { name: /sacar foto/i }).className).toContain('md:hidden')
  })

  it('los controles de cada plano tienen nombre y se pueden tocar', () => {
    render(<PlansPanel propertyId="p1" plans={planos} onChanged={() => {}} />)

    // Antes el botón de borrar era un ícono sin nombre — indistinguible de
    // "Ver" para un lector de pantalla, y borra.
    expect(screen.getByRole('button', { name: /^quitar /i })).toBeInTheDocument()
    const ver = screen.getByRole('link', { name: /^ver .* pestaña nueva$/i })
    expect(ver.className).toContain('max-md:min-h-11')
  })
})

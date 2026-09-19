// @vitest-environment happy-dom
/**
 * Landing B de tasación ("Tasación Neta"): el botón verde tiene que abrir el
 * formulario AL PRIMER TOQUE.
 *
 * El bug que estas pruebas clavan (producción, 2026-09-15 → 2026-09-19): el botón
 * estaba declarado como componente DENTRO del render de la landing. El primer
 * gesto sobre el botón precarga el formulario (cambia un estado), la landing se
 * vuelve a dibujar, y React —que ve un tipo de componente NUEVO en cada render—
 * destruía el botón y montaba otro en pleno toque: el clic caía sobre un nodo
 * que ya no estaba en la página y se perdía. En compu el hover precarga antes
 * del clic y no se notaba; en celular (86% del tráfico de la B) el primer toque
 * no hacía nada. Cinco días de tráfico pago con 0 registros reales en la B.
 *
 * Se prueba la LANDING entera y no el botón suelto a propósito: el defecto no
 * estaba en el botón sino en dónde se lo declaraba.
 */
import { createElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Lo pesado de la landing no participa del defecto: se reemplaza por nada.
vi.mock('next/image', () => ({
  default: (p: { src: string; alt: string }) => createElement('img', { src: p.src, alt: p.alt }),
}))
vi.mock('next/dynamic', () => ({
  // El formulario real se carga aparte; acá alcanza con saber si está abierto.
  default: () => (p: { open: boolean }) =>
    p.open ? createElement('div', { role: 'dialog' }, 'formulario') : null,
}))
vi.mock('@/components/funnel/FunnelClickToPlayVideo', () => ({ FunnelClickToPlayVideo: () => null }))
vi.mock('@/components/funnel/FunnelMetaPixel', () => ({
  FunnelMetaPixel: () => null,
  trackFunnelConversion: vi.fn(),
  getMetaCookie: () => undefined,
}))
vi.mock('@/components/funnel/FunnelHeatmapTracker', () => ({ FunnelHeatmapTracker: () => null }))
vi.mock('@/components/funnel/HeatmapOverlay', () => ({ HeatmapOverlay: () => null }))
vi.mock('@/components/funnel/TestimonialCard', () => ({ TestimonialCard: () => null }))

import { TasacionNetaClient } from './TasacionNetaClient'
import { TASACION_B_CONTENT } from '@/lib/funnel/content'

const landing = () =>
  render(
    <TasacionNetaClient testimonials={[]} heroVideoUrl="v.mp4" heroPosterUrl="p.jpg" logoUrl="/logo.png" pixelId="" />,
  )
const botones = () => screen.getAllByRole('button', { name: TASACION_B_CONTENT.cta.label })

describe('TasacionNetaClient — botón de solicitar la tasación', () => {
  it('tiene los dos botones: debajo del video y al final', () => {
    landing()
    expect(botones()).toHaveLength(2)
  })

  it('precargar el formulario NO destruye ni recrea los botones', () => {
    landing()
    const [arriba, abajo] = botones()
    // El primer gesto (pasar el dedo/mouse, o el foco) dispara la precarga.
    fireEvent.mouseEnter(arriba)
    const [arribaDespues, abajoDespues] = botones()
    // Mismo nodo del DOM: si React lo remontó, el toque en curso se pierde.
    expect(arribaDespues).toBe(arriba)
    expect(abajoDespues).toBe(abajo)
  })

  it('el botón de arriba abre el formulario al PRIMER toque', async () => {
    landing()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.setup().click(botones()[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('el botón del final abre el formulario al PRIMER toque', async () => {
    landing()
    await userEvent.setup().click(botones()[1])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

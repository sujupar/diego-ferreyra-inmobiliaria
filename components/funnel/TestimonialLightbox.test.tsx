// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TestimonialLightbox } from './TestimonialLightbox'

describe('TestimonialLightbox', () => {
  it('es un dialog modal, bloquea el scroll y cierra con ESC', async () => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<TestimonialLightbox videoUrl="https://x/v.mp4" clientName="Federico" onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cierra con el botón ✕', async () => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<TestimonialLightbox videoUrl="https://x/v.mp4" clientName="Pablo" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /cerrar video/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

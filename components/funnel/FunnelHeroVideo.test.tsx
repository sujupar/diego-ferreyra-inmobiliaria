// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FunnelHeroVideo } from './FunnelHeroVideo'

describe('FunnelHeroVideo', () => {
  it('arranca muted con el overlay de sonido y lo activa al click', async () => {
    // happy-dom no implementa HTMLMediaElement.play → stub
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<FunnelHeroVideo src="https://x/v.mp4" poster="https://x/p.jpg" />)

    const btn = screen.getByRole('button', { name: /activar el sonido/i })
    expect(btn).toBeInTheDocument()

    await user.click(btn)
    expect(screen.queryByRole('button', { name: /activar el sonido/i })).not.toBeInTheDocument()
  })
})

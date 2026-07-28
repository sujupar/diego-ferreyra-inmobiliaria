// @vitest-environment happy-dom
/**
 * Puerta de registro de la galería (E2.0).
 *
 * Lo que tiene que pasar sí o sí:
 *  - Se ven 3 fotos gratis y el RESTO se intuye (borrosas, con candado) → intriga.
 *  - Tocar una bloqueada (o el botón) abre el popup de registro, NO la foto.
 *  - Con la galería bloqueada, el lightbox de las libres NO puede navegar a las
 *    bloqueadas (sino las flechas revelarían lo que pedimos registrarse para ver).
 *  - Registrada la persona (unlocked), se ve todo y desaparece el candado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GalleryLightbox } from './GalleryLightbox'

const openLeadCapture = vi.fn()
let unlocked = false

vi.mock('../LeadCaptureProvider', () => ({
  useLeadCapture: () => ({ open: openLeadCapture, unlocked }),
  GALLERY_LOCK_SOURCE: 'galeria_bloqueada',
}))

const images = Array.from({ length: 12 }, (_, i) => ({ src: `https://cdn.test/f${i}.jpg` }))

beforeEach(() => {
  openLeadCapture.mockClear()
  unlocked = false
})

describe('galería BLOQUEADA (visitante sin registrar)', () => {
  it('muestra 3 fotos libres y adelanta el resto con candado', () => {
    render(<GalleryLightbox images={images} />)
    // 3 ampliables + 6 bloqueadas de adelanto
    expect(screen.getAllByRole('button', { name: /^Ampliar foto/ })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /registrate para verla/ })).toHaveLength(6)
  })

  it('dice cuántas fotos quedan e invita a registrarse', () => {
    render(<GalleryLightbox images={images} />)
    expect(screen.getByText(/9 fotos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver todas las fotos/ })).toBeInTheDocument()
  })

  it('tocar una foto bloqueada abre el registro y NO la foto', async () => {
    const user = userEvent.setup()
    render(<GalleryLightbox images={images} />)
    await user.click(screen.getAllByRole('button', { name: /registrate para verla/ })[0])
    expect(openLeadCapture).toHaveBeenCalledWith('galeria_bloqueada')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el botón principal abre el registro', async () => {
    const user = userEvent.setup()
    render(<GalleryLightbox images={images} />)
    await user.click(screen.getByRole('button', { name: /Ver todas las fotos/ }))
    expect(openLeadCapture).toHaveBeenCalledWith('galeria_bloqueada')
  })

  it('el lightbox de una foto libre NO deja llegar a las bloqueadas', async () => {
    const user = userEvent.setup()
    render(<GalleryLightbox images={images} />)
    await user.click(screen.getAllByRole('button', { name: /^Ampliar foto/ })[0])
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // Avanzar 3 veces desde la 1ª da la vuelta sobre las 3 libres: nunca aparece
    // una imagen fuera de las primeras 3.
    const next = screen.getByRole('button', { name: 'Siguiente' })
    for (let i = 0; i < 3; i++) await user.click(next)
    const shown = dialog.querySelector('img')?.getAttribute('src')
    expect(['f0', 'f1', 'f2'].some(f => shown?.includes(f))).toBe(true)
  })

  it('con 3 fotos o menos no hay nada que bloquear', () => {
    render(<GalleryLightbox images={images.slice(0, 3)} />)
    expect(screen.queryByRole('button', { name: /registrate para verla/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver todas las fotos/ })).not.toBeInTheDocument()
  })
})

describe('galería DESBLOQUEADA (ya dejó sus datos)', () => {
  beforeEach(() => {
    unlocked = true
  })

  it('no queda ninguna foto con candado ni invitación a registrarse', () => {
    render(<GalleryLightbox images={images} />)
    expect(screen.queryByRole('button', { name: /registrate para verla/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver todas las fotos/ })).not.toBeInTheDocument()
  })

  it('muestra las fotos ampliables (revelado progresivo de siempre)', () => {
    render(<GalleryLightbox images={images} />)
    // 12 fotos: 9 iniciales + botón "Ver galería completa"
    expect(screen.getAllByRole('button', { name: /^Ampliar foto/ })).toHaveLength(9)
    expect(screen.getByRole('button', { name: 'Ver galería completa' })).toBeInTheDocument()
  })
})

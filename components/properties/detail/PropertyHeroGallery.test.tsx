// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyHeroGallery } from './PropertyHeroGallery'

const photos = Array.from({ length: 22 }, (_, i) => `https://x/${i}.jpg`)

describe('PropertyHeroGallery', () => {
  it('muestra los chips con el material disponible', () => {
    render(<PropertyHeroGallery photos={photos} address="Rivadavia 4820" plansCount={2} hasVideo hasTour />)
    expect(screen.getByText('22 fotos')).toBeInTheDocument()
    expect(screen.getByText('2 planos')).toBeInTheDocument()
    expect(screen.getByText('Video')).toBeInTheDocument()
    expect(screen.getByText('Recorrido 360°')).toBeInTheDocument()
  })

  it('no muestra chips de material que no existe', () => {
    render(<PropertyHeroGallery photos={['https://x/0.jpg']} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText('1 foto')).toBeInTheDocument()
    expect(screen.queryByText('Video')).not.toBeInTheDocument()
    expect(screen.queryByText(/plano/)).not.toBeInTheDocument()
  })

  it('indica cuántas fotos quedan fuera del mosaico', () => {
    render(<PropertyHeroGallery photos={photos} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText('+17')).toBeInTheDocument()
  })

  it('abre el visor al hacer clic en una foto y cierra con ESC', async () => {
    const user = userEvent.setup()
    render(<PropertyHeroGallery photos={photos} address="Rivadavia 4820" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ver foto 1/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin fotos muestra el panel de marca con el botón para subirlas', async () => {
    const onGoToMedia = vi.fn()
    const user = userEvent.setup()
    render(<PropertyHeroGallery photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false} onGoToMedia={onGoToMedia} />)

    expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /subir fotos/i }))
    expect(onGoToMedia).toHaveBeenCalledTimes(1)
  })

  it('sin fotos y sin permiso de multimedia (abogado) no ofrece subirlas', () => {
    render(<PropertyHeroGallery photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /subir fotos/i })).not.toBeInTheDocument()
  })
})

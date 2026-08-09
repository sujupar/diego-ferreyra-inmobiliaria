// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyNextStepBanner } from './PropertyNextStepBanner'
import type { NextStep } from '@/lib/properties/detail-view'

const stepTab: NextStep = {
  id: 'docs', tone: 'warn', title: 'Falta la documentación',
  text: 'Subí los documentos obligatorios.',
  action: { kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' },
}

/** Las tres acciones son excluyentes: cada test fija solo la que le importa. */
const props = {
  submitting: false,
  onGoToTab: () => {},
  onSubmitReview: () => {},
  onSubirFotos: () => {},
}

describe('PropertyNextStepBanner', () => {
  it('sin próximo paso no dibuja nada', () => {
    const { container } = render(<PropertyNextStepBanner {...props} step={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('la acción de tipo pestaña avisa a qué pestaña ir', async () => {
    const onGoToTab = vi.fn()
    const user = userEvent.setup()
    render(<PropertyNextStepBanner {...props} step={stepTab} onGoToTab={onGoToTab} />)

    expect(screen.getByText('Falta la documentación')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ir a documentación/i }))
    expect(onGoToTab).toHaveBeenCalledWith('documentacion')
  })

  it('la acción de enviar a revisión dispara su propio callback', async () => {
    const onSubmitReview = vi.fn()
    const user = userEvent.setup()
    const step: NextStep = {
      id: 'submit', tone: 'info', title: 'Lista para revisión legal', text: 'Ya hay documentación cargada.',
      action: { kind: 'submit-review', label: 'Enviar a Revisión Legal' },
    }
    render(<PropertyNextStepBanner {...props} step={step} onSubmitReview={onSubmitReview} />)

    await user.click(screen.getByRole('button', { name: /enviar a revisión legal/i }))
    expect(onSubmitReview).toHaveBeenCalledTimes(1)
  })

  /**
   * El aviso de fotos pendientes se ve estando YA en la pestaña Multimedia, así
   * que mandarlo a cambiar de pestaña no hacía nada visible. Ahora abre el
   * selector de archivos y NO toca la navegación.
   */
  const stepFotos: NextStep = {
    id: 'photos', tone: 'warn', title: 'Fotos pendientes',
    text: 'La revisión legal fue aprobada. Subí las fotos para completar la captación.',
    action: { kind: 'subir-fotos', label: 'Subir fotos' },
  }

  it('la acción de subir fotos abre el selector sin cambiar de pestaña', async () => {
    const onSubirFotos = vi.fn()
    const onGoToTab = vi.fn()
    const user = userEvent.setup()
    render(<PropertyNextStepBanner {...props} step={stepFotos} onSubirFotos={onSubirFotos} onGoToTab={onGoToTab} />)

    await user.click(screen.getByRole('button', { name: /subir fotos/i }))
    expect(onSubirFotos).toHaveBeenCalledTimes(1)
    expect(onGoToTab).not.toHaveBeenCalled()
  })

  it('mientras sube fotos, ese botón queda deshabilitado', () => {
    render(<PropertyNextStepBanner {...props} step={stepFotos} subiendoFotos />)
    expect(screen.getByRole('button', { name: /subir fotos/i })).toBeDisabled()
  })

  it('mientras envía, el botón queda deshabilitado', () => {
    const step: NextStep = {
      id: 'submit', tone: 'info', title: 'Lista', text: '.',
      action: { kind: 'submit-review', label: 'Enviar a Revisión Legal' },
    }
    render(<PropertyNextStepBanner {...props} step={step} submitting />)
    expect(screen.getByRole('button', { name: /enviar a revisión legal/i })).toBeDisabled()
  })

  it('un paso sin acción no dibuja botón', () => {
    const step: NextStep = { id: 'legal-waiting', tone: 'info', title: 'En revisión legal', text: 'Enviada al abogado.', action: null }
    render(<PropertyNextStepBanner {...props} step={step} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

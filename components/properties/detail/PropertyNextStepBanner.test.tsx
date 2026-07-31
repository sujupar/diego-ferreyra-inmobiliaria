// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyNextStepBanner } from './PropertyNextStepBanner'
import type { NextStep } from '@/lib/properties/detail-view'

const stepTab: NextStep = {
  id: 'photos', tone: 'warn', title: 'Fotos pendientes',
  text: 'La revisión legal fue aprobada. Subí las fotos para completar la captación.',
  action: { kind: 'tab', tab: 'multimedia', label: 'Subir fotos' },
}

describe('PropertyNextStepBanner', () => {
  it('sin próximo paso no dibuja nada', () => {
    const { container } = render(
      <PropertyNextStepBanner step={null} submitting={false} onGoToTab={() => {}} onSubmitReview={() => {}} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('la acción de tipo pestaña avisa a qué pestaña ir', async () => {
    const onGoToTab = vi.fn()
    const user = userEvent.setup()
    render(<PropertyNextStepBanner step={stepTab} submitting={false} onGoToTab={onGoToTab} onSubmitReview={() => {}} />)

    expect(screen.getByText('Fotos pendientes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Subir fotos' }))
    expect(onGoToTab).toHaveBeenCalledWith('multimedia')
  })

  it('la acción de enviar a revisión dispara su propio callback', async () => {
    const onSubmitReview = vi.fn()
    const user = userEvent.setup()
    const step: NextStep = {
      id: 'submit', tone: 'info', title: 'Lista para revisión legal', text: 'Ya hay documentación cargada.',
      action: { kind: 'submit-review', label: 'Enviar a Revisión Legal' },
    }
    render(<PropertyNextStepBanner step={step} submitting={false} onGoToTab={() => {}} onSubmitReview={onSubmitReview} />)

    await user.click(screen.getByRole('button', { name: /enviar a revisión legal/i }))
    expect(onSubmitReview).toHaveBeenCalledTimes(1)
  })

  it('mientras envía, el botón queda deshabilitado', () => {
    const step: NextStep = {
      id: 'submit', tone: 'info', title: 'Lista', text: '.',
      action: { kind: 'submit-review', label: 'Enviar a Revisión Legal' },
    }
    render(<PropertyNextStepBanner step={step} submitting onGoToTab={() => {}} onSubmitReview={() => {}} />)
    expect(screen.getByRole('button', { name: /enviar a revisión legal/i })).toBeDisabled()
  })

  it('un paso sin acción no dibuja botón', () => {
    const step: NextStep = { id: 'legal-waiting', tone: 'info', title: 'En revisión legal', text: 'Enviada al abogado.', action: null }
    render(<PropertyNextStepBanner step={step} submitting={false} onGoToTab={() => {}} onSubmitReview={() => {}} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocsTab } from './DocsTab'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'

const flags: LegalFlags = { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }
const docs: LegalDocsState = {}

const base = {
  propertyId: 'p1', propertyType: 'departamento', docs, flags,
  legalNotes: null as string | null,
  onUpdated: () => {}, onReviewed: () => {},
}

describe('DocsTab', () => {
  it('al abogado con revisión pendiente le muestra aprobar y rechazar', () => {
    render(<DocsTab {...base} isAbogado status="pending_review" legalStatus="pending" />)
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeInTheDocument()
  })

  it('al asesor nunca le muestra los botones de revisión', () => {
    render(<DocsTab {...base} isAbogado={false} status="pending_review" legalStatus="pending" />)
    expect(screen.queryByRole('button', { name: /^aprobar$/i })).not.toBeInTheDocument()
  })

  it('muestra el resultado de la revisión con las observaciones del abogado', () => {
    render(<DocsTab {...base} isAbogado={false} status="approved" legalStatus="rejected" legalNotes="Escritura vencida" />)
    expect(screen.getByText(/rechazada en revisión legal/i)).toBeInTheDocument()
    expect(screen.getByText('Escritura vencida')).toBeInTheDocument()
  })

  it('aprobar llama al endpoint de revisión y avisa al padre', async () => {
    const onReviewed = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<DocsTab {...base} isAbogado status="pending_review" legalStatus="pending" onReviewed={onReviewed} />)
    await user.click(screen.getByRole('button', { name: /aprobar/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/properties/p1/review', expect.objectContaining({ method: 'POST' }))
    expect(onReviewed).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

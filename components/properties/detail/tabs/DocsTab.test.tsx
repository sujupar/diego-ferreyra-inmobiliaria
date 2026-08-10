// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocsTab } from './DocsTab'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'

const flags: LegalFlags = { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }
const docs: LegalDocsState = {}

const ENVIADA = '2026-08-09T10:00:00Z'

const base = {
  propertyId: 'p1', propertyType: 'departamento', docs, flags,
  legalNotes: null as string | null,
  legalSubmittedAt: ENVIADA as string | null,
  documentosCargados: 0,
  onSubmitReview: () => {},
  enviando: false,
  onUpdated: () => {}, onReviewed: () => {},
}

describe('DocsTab', () => {
  it('al abogado con revisión pendiente le muestra aprobar y rechazar', () => {
    render(<DocsTab {...base} isAbogado legalStatus="pending" />)
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeInTheDocument()
  })

  it('al asesor nunca le muestra los botones de revisión', () => {
    render(<DocsTab {...base} isAbogado={false} legalStatus="pending" />)
    expect(screen.queryByRole('button', { name: /^aprobar$/i })).not.toBeInTheDocument()
  })

  /**
   * El lockout que encontró la revisión adversarial. Con la condición vieja
   * (`status === 'pending_review'`), subir una foto captaba la propiedad, le
   * ponía status='approved' y le sacaba al abogado los botones EN EL MEDIO de
   * su revisión: no podía ni aprobar ni rechazar, la propiedad desaparecía de
   * su bandeja y su tarea quedaba abierta para siempre.
   */
  it('sigue pudiendo revisar aunque la propiedad ya esté captada y publicada', () => {
    render(<DocsTab {...base} isAbogado legalStatus="pending" />)
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeInTheDocument()
  })

  it('si nunca se la enviaron, no hay nada que revisar', () => {
    render(<DocsTab {...base} isAbogado legalStatus="pending" legalSubmittedAt={null} />)
    expect(screen.queryByRole('button', { name: /^aprobar$/i })).not.toBeInTheDocument()
  })

  it('muestra el resultado de la revisión con las observaciones del abogado', () => {
    render(<DocsTab {...base} isAbogado={false} legalStatus="rejected" legalNotes="Escritura vencida" />)
    expect(screen.getByText(/rechazada en revisión legal/i)).toBeInTheDocument()
    expect(screen.getByText('Escritura vencida')).toBeInTheDocument()
  })

  /* ------------------- enviar la documentación al abogado ------------------ */

  /**
   * H1. El envío vivía SOLO colgado del aviso de la cabecera, que muestra un
   * paso por vez: sobre una propiedad sin fotos ganaba "Fotos pendientes" y el
   * botón no existía en ningún lado. Escenario real: el propietario entrega la
   * escritura el día 1 y la sesión de fotos es la semana que viene → los
   * papeles no le llegaban nunca al abogado.
   */
  it('con documentos cargados y sin enviar, ofrece mandarlos — sin mirar fotos ni captación', async () => {
    const onSubmitReview = vi.fn()
    const user = userEvent.setup()
    render(
      <DocsTab {...base} isAbogado={false} legalStatus="pending" legalSubmittedAt={null}
        documentosCargados={2} onSubmitReview={onSubmitReview} />,
    )

    const boton = screen.getByRole('button', { name: /enviar a revisión legal/i })
    expect(boton).toBeEnabled()
    await user.click(boton)
    expect(onSubmitReview).toHaveBeenCalledTimes(1)
  })

  it('sin ningún archivo cargado el botón está apagado y dice por qué', () => {
    render(<DocsTab {...base} isAbogado={false} legalStatus="pending" legalSubmittedAt={null} documentosCargados={0} />)
    expect(screen.getByRole('button', { name: /enviar a revisión legal/i })).toBeDisabled()
    expect(screen.getByText(/subí al menos un documento/i)).toBeInTheDocument()
  })

  /**
   * H2. `submitPropertyForLegalReview` devuelve el legal de 'rejected' a
   * 'pending' y tiene test propio, pero el aviso decía "volvé a enviarla" y el
   * botón no existía: el arreglo estaba en el servicio y no en la pantalla.
   */
  it('una rechazada se puede volver a enviar', async () => {
    const onSubmitReview = vi.fn()
    const user = userEvent.setup()
    render(
      <DocsTab {...base} isAbogado={false} legalStatus="rejected" legalNotes="Escritura vencida"
        documentosCargados={3} onSubmitReview={onSubmitReview} />,
    )

    await user.click(screen.getByRole('button', { name: /volver a enviar/i }))
    expect(onSubmitReview).toHaveBeenCalledTimes(1)
  })

  it('mientras el abogado la tiene no se puede volver a mandar, y se dice', () => {
    render(<DocsTab {...base} isAbogado={false} legalStatus="pending" documentosCargados={3} />)
    expect(screen.queryByRole('button', { name: /enviar a revisión legal/i })).not.toBeInTheDocument()
    expect(screen.getByText(/está en revisión legal/i)).toBeInTheDocument()
  })

  it('el abogado no ve el botón de enviar', () => {
    render(<DocsTab {...base} isAbogado legalStatus="pending" legalSubmittedAt={null} documentosCargados={3} />)
    expect(screen.queryByRole('button', { name: /enviar a revisión legal/i })).not.toBeInTheDocument()
  })

  it('con un envío en vuelo el botón queda bloqueado', () => {
    render(
      <DocsTab {...base} isAbogado={false} legalStatus="pending" legalSubmittedAt={null}
        documentosCargados={2} enviando />,
    )
    expect(screen.getByRole('button', { name: /enviar a revisión legal/i })).toBeDisabled()
  })

  it('aprobar llama al endpoint de revisión y avisa al padre', async () => {
    const onReviewed = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<DocsTab {...base} isAbogado legalStatus="pending" onReviewed={onReviewed} />)
    await user.click(screen.getByRole('button', { name: /aprobar/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/properties/p1/review', expect.objectContaining({ method: 'POST' }))
    expect(onReviewed).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

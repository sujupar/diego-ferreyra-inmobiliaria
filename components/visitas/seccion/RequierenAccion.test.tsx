// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { RequierenAccion } from './RequierenAccion'
import { requierenAccion } from '@/lib/visitas/resumen'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
let cuerpos: unknown[] = []

beforeEach(() => {
  cuerpos = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    cuerpos.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ data: null }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})

describe('RequierenAccion', () => {
  it('sin pendientes lo dice', () => {
    render(<RequierenAccion requieren={requierenAccion([], AHORA)} mostrarAsesor onCambio={() => {}} />)
    expect(screen.getByText('No hay nada para resolver.')).toBeInTheDocument()
  })
  it('una visita que pasó sin resultado ofrece Se realizó / No se realizó / Reprogramar; una a confirmar, Confirmar', () => {
    const r = requierenAccion([
      v({ status: 'scheduled', scheduled_at: '2026-10-14T13:00:00Z', client_name: 'Pasada' }),
      v({ status: 'pending_confirmation', scheduled_at: '2026-10-20T13:00:00Z', client_name: 'Futura' }),
    ], AHORA)
    render(<RequierenAccion requieren={r} mostrarAsesor onCambio={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Requieren tu acción (2)' })).toBeInTheDocument()
    const pasada = screen.getByText(/Pasada/).closest('li') as HTMLElement
    expect(within(pasada).getAllByRole('button').map(b => b.textContent)).toEqual(['Se realizó', 'No se realizó', 'Reprogramar'])
    const futura = screen.getByText(/Futura/).closest('li') as HTMLElement
    expect(within(futura).getAllByRole('button').map(b => b.textContent)).toEqual(['Confirmar'])
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('min-h-11')
  })
  it('"Se realizó" ahí mismo: pide el interés, manda la acción con la versión y avisa para recargar', async () => {
    const pasada = v({ status: 'scheduled', scheduled_at: '2026-10-14T13:00:00Z' })
    const onCambio = vi.fn()
    render(<RequierenAccion requieren={requierenAccion([pasada], AHORA)} mostrarAsesor onCambio={onCambio} />)
    await userEvent.click(screen.getByRole('button', { name: 'Se realizó' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Alto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onCambio).toHaveBeenCalled())
    expect(cuerpos[0]).toEqual({ tipo: 'realizada', interes: 'alto', notas: '', version: pasada.updated_at })
  })
  it('lista las encuestas sin responder hace más de 48 h, sin botones de etapa', () => {
    const enc = { sent_at: '2026-10-10T12:00:00Z', completed_at: null, expires_at: '2026-11-09T12:00:00Z', liked: null, price_opinion: null,
      offer_amount: null, offer_currency: null, offer_declined: null, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null }
    const r = requierenAccion([], AHORA, [v({ status: 'completed', client_name: 'Ana Encuesta', encuesta: enc })])
    render(<RequierenAccion requieren={r} mostrarAsesor onCambio={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Encuestas sin responder hace más de 48 h' })).toBeInTheDocument()
    expect(screen.getByText(/Ana Encuesta/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Se realizó' })).not.toBeInTheDocument()
  })
})

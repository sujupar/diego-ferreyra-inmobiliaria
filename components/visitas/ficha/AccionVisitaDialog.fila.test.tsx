// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AccionVisitaDialog } from './AccionVisitaDialog'
import { visitaDePrueba } from '@/test/visitas/visita-de-prueba'

describe('AccionVisitaDialog desde la sección Visitas', () => {
  it('acepta una fila del listado y manda su versión EXACTA', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: null }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const fila = visitaDePrueba({ status: 'pending_confirmation' })
    const onRecargar = vi.fn()
    render(<AccionVisitaDialog visita={fila} accion="confirmar" onClose={() => {}} onHecho={() => {}} onRecargar={onRecargar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onRecargar).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/visits/${fila.id}/estado`)
    expect(JSON.parse(String(init?.body))).toEqual({ tipo: 'confirmar', version: fila.updated_at })
  })
})

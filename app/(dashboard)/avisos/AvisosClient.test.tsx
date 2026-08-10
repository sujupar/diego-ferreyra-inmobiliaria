// @vitest-environment happy-dom
/**
 * La pantalla "Avisos por identificar" tiene que distinguir TRES estados:
 * cargando, no pude leer, y no hay nada. Antes tenía uno solo — cualquier
 * fallo se convertía en `{ data: [] }` y salía por pantalla como la tarjeta
 * verde "Todas las consultas están identificadas", con avisos pendientes de
 * verdad del otro lado.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AvisosClient } from './AvisosClient'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const AVISO = {
  portal: 'zonaprop',
  externalCode: '2DLPOM',
  title: 'Depto 2 ambientes',
  inquiryCount: 3,
  lastInquiryAt: new Date().toISOString(),
  lastLeadName: 'Marcelo',
}

/** Servidor de mentira: la cola responde lo que se le pida; el resto, vacío y OK. */
function servidor(colaStatus: number, colaBody: unknown) {
  return vi.fn(async (url: string) => {
    if (url.startsWith('/api/portal-inquiries/unidentified')) return json(colaStatus, colaBody)
    if (url.startsWith('/api/users/advisors')) return json(200, { data: [] })
    return json(200, { data: [], hasMore: false })
  })
}

async function montarCon(colaStatus: number, colaBody: unknown) {
  vi.stubGlobal('fetch', servidor(colaStatus, colaBody))
  render(<AvisosClient />)
  await waitFor(() => expect(screen.queryByText(/Buscando avisos pendientes/)).toBeNull())
}

describe('AvisosClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('una cola realmente vacía SÍ dice que está todo identificado', async () => {
    await montarCon(200, { data: [] })
    expect(screen.getByText('No hay avisos pendientes')).toBeTruthy()
  })

  it('con avisos pendientes los lista', async () => {
    await montarCon(200, { data: [AVISO] })
    expect(screen.getByText('Depto 2 ambientes')).toBeTruthy()
    expect(screen.getByText(/3 consultas esperando/)).toBeTruthy()
    expect(screen.queryByText('No hay avisos pendientes')).toBeNull()
  })

  it('un 403 (asesor que tipeó la URL) NO se muestra como "todo identificado"', async () => {
    await montarCon(403, { error: 'forbidden' })
    expect(screen.queryByText('No hay avisos pendientes')).toBeNull()
    expect(screen.getByText('No pudimos mostrar los avisos')).toBeTruthy()
    expect(screen.getByText(/permiso/i)).toBeTruthy()
    // Reintentar un 403 no arregla nada: no se ofrece.
    expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull()
  })

  it('un 500 de Supabase tampoco — y ahí sí se puede reintentar', async () => {
    await montarCon(500, { error: 'timeout' })
    expect(screen.queryByText('No hay avisos pendientes')).toBeNull()
    expect(screen.getByText(/error 500/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeTruthy()
  })

  it('el cartel de error dice explícitamente que NO significa "está todo al día"', async () => {
    await montarCon(500, { error: 'timeout' })
    expect(screen.getByText(/no lo pudimos leer/i)).toBeTruthy()
  })
})

// @vitest-environment happy-dom
/**
 * El cartel del inicio es la señal de "hay trabajo pendiente". Antes hacía
 * `r.ok ? r.json() : { data: [] }`, así que un 500 dejaba `count = 0` y el
 * cartel no se dibujaba: no poder leer la cola se veía IGUAL que tener la cola
 * vacía, justo en la pantalla cuyo único propósito es avisar.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { UnidentifiedBanner } from './UnidentifiedBanner'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function aviso(code: string) {
  return { portal: 'zonaprop', externalCode: code, title: null, inquiryCount: 1, lastInquiryAt: '2026-08-06T12:00:00Z', lastLeadName: null }
}

async function montar(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => json(status, body)))
  const { container } = render(<UnidentifiedBanner />)
  await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0))
  return container
}

describe('UnidentifiedBanner', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('con avisos pendientes muestra cuántos', async () => {
    await montar(200, { data: [aviso('A'), aviso('B')] })
    await waitFor(() => expect(screen.getByText('2 avisos sin identificar')).toBeTruthy())
  })

  it('con la cola vacía no dibuja nada', async () => {
    const container = await montar(200, { data: [] })
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('un 500 NO se calla: avisa que no se pudo revisar', async () => {
    await montar(500, { error: 'boom' })
    await waitFor(() => expect(screen.getByText('No pudimos revisar los avisos sin identificar')).toBeTruthy())
  })

  it('un 403 sí se calla — ese rol no tiene nada que hacer en esta cola', async () => {
    const container = await montar(403, { error: 'forbidden' })
    await waitFor(() => expect(container.textContent).toBe(''))
  })
})

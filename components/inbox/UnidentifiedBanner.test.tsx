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

function aviso(codigo: string) {
  return { portal: 'zonaprop', codigo, titulo: null, url: null, foto: null, n: 1, ultima: '2026-10-30T12:00:00Z' }
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

  it('con avisos pendientes muestra cuántos y lleva a la hoja de Consultas', async () => {
    await montar(200, { avisos: [aviso('A'), aviso('B')], sueltas: 0 })
    await waitFor(() => expect(screen.getByText('2 avisos sin propiedad')).toBeTruthy())
    expect(screen.getByRole('link').getAttribute('href')).toBe('/consultas?avisos=1')
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/consultas/avisos')
  })

  it('con la cola vacía no dibuja nada', async () => {
    const container = await montar(200, { avisos: [], sueltas: 0 })
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('un 500 NO se calla: avisa que no se pudo revisar', async () => {
    await montar(500, { error: 'boom' })
    await waitFor(() => expect(screen.getByText('No pudimos revisar los avisos sin propiedad')).toBeTruthy())
  })

  it('un 403 sí se calla — ese rol no tiene nada que hacer en esta cola', async () => {
    const container = await montar(403, { error: 'forbidden' })
    await waitFor(() => expect(container.textContent).toBe(''))
  })
})

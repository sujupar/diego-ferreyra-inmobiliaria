// @vitest-environment happy-dom
// crm-ficha-y-llamadas 11.1: en /pipeline/<id> el nombre del contacto lleva a su ficha;
// sin contacto vinculado, o para el abogado, queda como texto.
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DealDetailPage from './page'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'd-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))

function red(contactId: string | null, rol: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: 'u-1', role: rol }))
      if (url.startsWith('/api/deals/d-1')) {
        return new Response(
          JSON.stringify({
            data: {
              id: 'd-1',
              stage: 'request',
              property_address: 'Bacacay 2450',
              contact_id: contactId,
              contacts: contactId ? { full_name: 'Marcela Ibáñez', phone: null, email: null } : null,
              origin: 'embudo',
              notes: '',
            },
          }),
        )
      }
      return new Response(JSON.stringify({}), { status: 404 })
    }),
  )
}
afterEach(() => vi.unstubAllGlobals())

describe('/pipeline/[id]: el nombre del contacto', () => {
  it('con contacto, enlaza a /contacts/<id>', async () => {
    red('c-1', 'coordinador')
    render(<DealDetailPage />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Marcela Ibáñez' })).toHaveAttribute('href', '/contacts/c-1'))
  })
  it('para el abogado, texto simple', async () => {
    red('c-1', 'abogado')
    render(<DealDetailPage />)
    await screen.findAllByText('Marcela Ibáñez')
    // Espera a que llegue el rol antes de afirmar que no hay enlace.
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/auth/me'))).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('link', { name: 'Marcela Ibáñez' })).toBeNull()
  })
  it('sin contacto vinculado, sin enlace', async () => {
    red(null, 'coordinador')
    render(<DealDetailPage />)
    await screen.findAllByText('Bacacay 2450', { exact: false })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryAllByRole('link').some((a) => a.getAttribute('href')?.startsWith('/contacts/'))).toBe(false)
  })
})

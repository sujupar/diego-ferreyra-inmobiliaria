// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { armarResumen } from '@/lib/visitas/resumen'

/**
 * Piso móvil de la sección: mismo marco que el resto de las pantallas (el layout ya pone
 * `p-4 md:p-6`; nada de `container mx-auto py-6`), y todo lo tocable de ≥ 44 px.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/visits',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/components/visitas/BotonAgendarVisita', () => ({
  BotonAgendarVisita: () => <button type="button" className="min-h-11">Agendar visita</button>,
}))

import VisitsPage from './page'

beforeEach(() => {
  const data = armarResumen({ periodo: { desde: '2026-09-16', hasta: '2026-10-15' }, delPeriodo: [], abiertas: [], proximas: [],
    ahora: new Date(), truncado: false, verTodo: true })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.startsWith('/api/auth/me') ? { id: '11111111-1111-4111-8111-111111111111', role: 'admin' }
      : url.startsWith('/api/users/advisors') ? { data: [] } : { data }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})

describe('/visits en el celular', () => {
  it('no vuelve a envolver el contenido en `container mx-auto py-6`', async () => {
    const { container } = render(<VisitsPage />)
    await screen.findByText('Cómo vienen las visitas')
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).toContain('space-y-4')
    expect(raiz.className).not.toContain('container')
    expect(raiz.className).not.toContain('py-6')
  })
  it('los botones del período miden al menos 44 px y dicen si están elegidos', async () => {
    render(<VisitsPage />)
    await screen.findByText('Cómo vienen las visitas')
    for (const nombre of ['7 días', '30 días', 'Este mes', 'Personalizado']) {
      const b = screen.getByRole('button', { name: nombre })
      expect(b.className).toContain('min-h-11')
      expect(b).toHaveAttribute('aria-pressed')
    }
    expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('el botón Agendar visita está en el encabezado', async () => {
    render(<VisitsPage />)
    expect(await screen.findByRole('button', { name: 'Agendar visita' })).toBeInTheDocument()
  })
})

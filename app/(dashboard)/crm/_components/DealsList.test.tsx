// @vitest-environment happy-dom
// crm-ficha-y-llamadas 11.1: en cada tarjeta de /crm el nombre abre la ficha del contacto
// y el resto de la tarjeta sigue abriendo el proceso, sin un enlace dentro de otro.
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { DealsList } from './DealsList'
import type { Deal } from './types'

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))

const deal = (c: Partial<Deal> = {}): Deal & { crmStage: string } => ({
  id: 'd-1',
  stage: 'request',
  property_address: 'Bacacay 2450',
  scheduled_date: null,
  origin: 'embudo',
  assigned_to: null,
  assigned_to_name: '',
  contact_name: 'Marcela Ibáñez',
  contact_phone: '',
  contact_email: '',
  appraisal_id: null,
  property_id: null,
  stage_changed_at: '2026-11-24T13:00:00Z',
  created_at: '2026-11-24T13:00:00Z',
  contacts: { id: 'c-1' },
  crmStage: 'solicitud',
  ...c,
})

const dibujar = (d = deal(), extra: Partial<Parameters<typeof DealsList>[0]> = {}) =>
  render(<DealsList deals={[d]} selectMode={false} selectedIds={new Set()} onToggleSelection={() => {}} isGlobal rol="coordinador" {...extra} />)

describe('DealsList', () => {
  it('con enlace: el nombre va a la ficha y la tarjeta al proceso, y ninguno está dentro del otro', () => {
    dibujar()
    const nombre = screen.getByRole('link', { name: 'Marcela Ibáñez' })
    expect(nombre).toHaveAttribute('href', '/contacts/c-1')
    const proceso = screen.getByRole('link', { name: 'Abrir el proceso de Marcela Ibáñez' })
    expect(proceso).toHaveAttribute('href', '/pipeline/d-1')
    expect(proceso.contains(nombre)).toBe(false)
    expect(nombre.closest('a')).toBe(nombre)
  })

  it('sin enlace para el abogado', () => {
    dibujar(deal(), { rol: 'abogado' })
    expect(screen.queryByRole('link', { name: 'Marcela Ibáñez' })).toBeNull()
    expect(screen.getByText('Marcela Ibáñez')).toBeInTheDocument()
  })

  it('sin enlace cuando el proceso no tiene contacto', () => {
    dibujar(deal({ contacts: null }))
    expect(screen.queryByRole('link', { name: 'Marcela Ibáñez' })).toBeNull()
    expect(screen.getByRole('link', { name: /Abrir el proceso/ })).toHaveAttribute('href', '/pipeline/d-1')
  })

  it('en modo selección no hay enlaces', () => {
    dibujar(deal(), { selectMode: true })
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { AgendaVisitas } from './AgendaVisitas'
import { armarAgenda } from '@/lib/visitas/resumen'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

describe('AgendaVisitas', () => {
  it('sin visitas: lo dice para hoy y para los próximos días', () => {
    render(<AgendaVisitas agenda={armarAgenda([], '2026-10-15')} mostrarAsesor hrefTodas="/visits/todas" />)
    expect(screen.getByText('No hay visitas hoy.')).toBeInTheDocument()
    expect(screen.getByText('Tampoco hay visitas en los próximos 7 días.')).toBeInTheDocument()
  })
  it('hora argentina, persona, origen, asesor, estado y link a la ficha', () => {
    const visita = v({ scheduled_at: '2026-10-15T13:30:00Z', client_name: 'Mariana López', origin: 'portal', origin_detail: 'zonaprop' })
    render(<AgendaVisitas agenda={armarAgenda([visita], '2026-10-15')} mostrarAsesor hrefTodas="/visits/todas?from=x" />)
    expect(screen.getByText('10:30')).toBeInTheDocument()
    expect(screen.getByText('Mariana López · Consulta de portal · Zonaprop · Lucas Pérez')).toBeInTheDocument()
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Doblas 248/ })).toHaveAttribute('href', `/visits/${visita.id}`)
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/visits/todas?from=x')
  })
  it('el asesor no ve su propio nombre en cada fila', () => {
    render(<AgendaVisitas agenda={armarAgenda([v({ scheduled_at: '2026-10-15T13:30:00Z' })], '2026-10-15')} mostrarAsesor={false} hrefTodas="/visits/todas" />)
    expect(screen.queryByText(/Lucas Pérez/)).not.toBeInTheDocument()
  })
})

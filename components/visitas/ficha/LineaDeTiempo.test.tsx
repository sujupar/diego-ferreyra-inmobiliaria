// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { LineaDeTiempo } from './LineaDeTiempo'
import type { EventoVisitaR } from '@/lib/visitas/tipos'

/**
 * Revisión final, grupo H: con el motivo "Otro", lo que escribió el asesor (que el
 * trigger copia a `note`) se perdía — el historial decía solo "Otro".
 */
function evento(p: Partial<EventoVisitaR>): EventoVisitaR {
  return {
    id: 'e1', kind: 'no_realizada', from_status: 'scheduled', to_status: 'no_show', from_scheduled_at: null,
    to_scheduled_at: null, reason: null, note: null, created_at: '2026-10-10T15:00:00Z', actor: 'Lucas',
    desde_asesor: null, hacia_asesor: null, ...p,
  }
}

describe('LineaDeTiempo — motivo y nota', () => {
  it('con motivo y nota muestra "<motivo> — <nota>"', () => {
    render(<LineaDeTiempo eventos={[evento({ reason: 'otro', note: 'Se mudó de día sin avisar' })]} />)
    expect(screen.getByText('Otro — Se mudó de día sin avisar')).toBeInTheDocument()
  })
  it('con motivo y sin nota muestra solo la etiqueta del motivo', () => {
    render(<LineaDeTiempo eventos={[evento({ reason: 'no_vino' })]} />)
    expect(screen.getByText('No vino')).toBeInTheDocument()
  })
  it('sin motivo y con nota (p. ej. reabierta) muestra la nota', () => {
    render(<LineaDeTiempo eventos={[evento({ kind: 'reabierta', note: 'Reabierta: avisó que sí puede' })]} />)
    expect(screen.getByText('Reabierta: avisó que sí puede')).toBeInTheDocument()
  })
  it('una nota de puros espacios no agrega un guion colgando', () => {
    render(<LineaDeTiempo eventos={[evento({ reason: 'cancelo_persona', note: '   ' })]} />)
    expect(screen.getByText('Canceló la persona')).toBeInTheDocument()
    expect(screen.queryByText(/—/)).not.toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { MINUTOS_PARA_DESHACER, MENSAJE_NO_SE_PUEDE_DESHACER, puedeDeshacerPerdido } from './deshacer-perdido'

const ahora = new Date('2026-11-25T15:00:00Z')
const haceMin = (m: number) => new Date(ahora.getTime() - m * 60_000).toISOString()

describe('puedeDeshacerPerdido', () => {
  it('el plazo es de 10 minutos', () => {
    expect(MINUTOS_PARA_DESHACER).toBe(10)
  })
  it('recién descartado: vuelve a la etapa anterior y limpia lost_at', () => {
    expect(
      puedeDeshacerPerdido(
        { stage: 'lost', lost_at: haceMin(1) },
        { from_stage: 'request', to_stage: 'lost', changed_at: haceMin(1) },
        ahora,
      ),
    ).toEqual({ ok: true, volverA: 'request', limpiarLostAt: true })
  })
  it('justo a los 10 minutos todavía se puede', () => {
    expect(
      puedeDeshacerPerdido({ stage: 'lost', lost_at: haceMin(10) }, { from_stage: 'followup', to_stage: 'lost', changed_at: haceMin(10) }, ahora).ok,
    ).toBe(true)
  })
  it('hace 11 minutos ya no', () => {
    expect(
      puedeDeshacerPerdido({ stage: 'lost', lost_at: haceMin(11) }, { from_stage: 'request', to_stage: 'lost', changed_at: haceMin(11) }, ahora),
    ).toEqual({ ok: false, motivo: MENSAJE_NO_SE_PUEDE_DESHACER })
  })
  it('si la última fila del historial no es el paso a lost, no se puede', () => {
    expect(
      puedeDeshacerPerdido({ stage: 'lost', lost_at: haceMin(1) }, { from_stage: 'lost', to_stage: 'request', changed_at: haceMin(1) }, ahora).ok,
    ).toBe(false)
  })
  it('sin historial no se puede', () => {
    expect(puedeDeshacerPerdido({ stage: 'lost', lost_at: haceMin(1) }, null, ahora).ok).toBe(false)
  })
  it('sin etapa anterior no se puede', () => {
    const r = puedeDeshacerPerdido({ stage: 'lost', lost_at: haceMin(1) }, { from_stage: null, to_stage: 'lost', changed_at: haceMin(1) }, ahora)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.motivo).toBe('No se sabe en qué etapa estaba el proceso: cambialo desde su pantalla.')
  })
  it('un lost_at viejo (de otra vez) no se limpia', () => {
    expect(
      puedeDeshacerPerdido(
        { stage: 'lost', lost_at: '2026-10-01T12:00:00Z' },
        { from_stage: 'followup', to_stage: 'lost', changed_at: haceMin(2) },
        ahora,
      ),
    ).toEqual({ ok: true, volverA: 'followup', limpiarLostAt: false })
  })
  it('lost_at a menos de un minuto del cambio se limpia', () => {
    const r = puedeDeshacerPerdido(
      { stage: 'lost', lost_at: haceMin(2) },
      { from_stage: 'request', to_stage: 'lost', changed_at: new Date(Date.parse(haceMin(2)) + 30_000).toISOString() },
      ahora,
    )
    expect(r.ok && r.limpiarLostAt).toBe(true)
  })
  it('sin lost_at no hay nada que limpiar', () => {
    const r = puedeDeshacerPerdido({ stage: 'lost', lost_at: null }, { from_stage: 'request', to_stage: 'lost', changed_at: haceMin(1) }, ahora)
    expect(r.ok && r.limpiarLostAt).toBe(false)
  })
  it('un proceso que no está en lost no se deshace', () => {
    expect(
      puedeDeshacerPerdido({ stage: 'request', lost_at: haceMin(1) }, { from_stage: 'request', to_stage: 'lost', changed_at: haceMin(1) }, ahora),
    ).toEqual({ ok: false, motivo: MENSAJE_NO_SE_PUEDE_DESHACER })
  })
  it('el mensaje es el de la spec', () => {
    expect(MENSAJE_NO_SE_PUEDE_DESHACER).toBe('Ya no se puede deshacer: pasaron más de 10 minutos o el proceso cambió de etapa.')
  })
})

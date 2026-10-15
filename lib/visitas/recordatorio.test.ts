import { describe, it, expect } from 'vitest'
import { ventanaDeRecordatorio, decidirRecordatorio } from './recordatorio'
import type { VisitaParaRecordar } from './tipos'

const AHORA = new Date('2026-10-15T15:00:00.000Z')
const visita = (cambios: Partial<VisitaParaRecordar> = {}): VisitaParaRecordar => ({
  id: '66666666-6666-4666-8666-666666666666', scheduled_at: '2026-10-15T12:00:00.000Z', status: 'scheduled',
  reminder_sent_at: null, client_name: 'Sofía', direccion: 'Doblas 248',
  asesor: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' }, ...cambios,
})

describe('ventanaDeRecordatorio', () => {
  it('de hace 48 h a hace 1 h', () => {
    expect(ventanaDeRecordatorio(AHORA)).toEqual({ desde: '2026-10-13T15:00:00.000Z', hasta: '2026-10-15T14:00:00.000Z' })
  })
})

describe('decidirRecordatorio', () => {
  it('confirmada, pasó hace 3 h, sin aviso y con asesor con email: se avisa', () => {
    expect(decidirRecordatorio(visita(), AHORA)).toEqual({ enviar: true, destino: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' } })
  })
  it('PRIMERA CORRIDA: una visita de hace 5 días no dispara nada (fuera de la ventana)', () => {
    expect(decidirRecordatorio(visita({ scheduled_at: '2026-10-10T12:00:00.000Z' }), AHORA)).toEqual({ enviar: false, motivo: 'fuera_de_ventana' })
  })
  it('dentro de la hora de gracia todavía no', () => {
    expect(decidirRecordatorio(visita({ scheduled_at: '2026-10-15T14:30:00.000Z' }), AHORA)).toEqual({ enviar: false, motivo: 'fuera_de_ventana' })
  })
  it('ya avisada, no confirmada, sin asesor o sin email: no se manda, con el motivo', () => {
    expect(decidirRecordatorio(visita({ reminder_sent_at: '2026-10-15T13:05:00Z' }), AHORA)).toEqual({ enviar: false, motivo: 'ya_enviado' })
    expect(decidirRecordatorio(visita({ status: 'pending_confirmation' }), AHORA)).toEqual({ enviar: false, motivo: 'no_esta_confirmada' })
    expect(decidirRecordatorio(visita({ status: 'completed' }), AHORA)).toEqual({ enviar: false, motivo: 'no_esta_confirmada' })
    expect(decidirRecordatorio(visita({ asesor: null }), AHORA)).toEqual({ enviar: false, motivo: 'sin_asesor' })
    expect(decidirRecordatorio(visita({ asesor: { nombre: 'Lucas', email: '  ' } }), AHORA)).toEqual({ enviar: false, motivo: 'asesor_sin_email' })
  })
  it('un asesor sin nombre recibe igual el aviso', () => {
    const d = decidirRecordatorio(visita({ asesor: { nombre: '', email: 'x@inmodf.com.ar' } }), AHORA)
    expect(d).toEqual({ enviar: true, destino: { nombre: 'equipo', email: 'x@inmodf.com.ar' } })
  })
})

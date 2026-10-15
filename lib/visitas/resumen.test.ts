import { describe, it, expect } from 'vitest'
import { armarAgenda, requierenAccion, armarResumen, separarProximasYPasadas } from './resumen'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const HOY = '2026-10-15'
const AHORA = new Date('2026-10-15T15:00:00Z') // 12:00 en Argentina

describe('armarAgenda', () => {
  it('agrupa por día ARGENTINO: las 23:30 del 15 (02:30 UTC del 16) van al 15', () => {
    const agenda = armarAgenda([
      v({ scheduled_at: '2026-10-16T02:30:00Z', client_name: 'Noche' }),
      v({ scheduled_at: '2026-10-15T13:00:00Z', client_name: 'Mañana temprano' }),
    ], HOY)
    expect(agenda).toHaveLength(1)
    expect(agenda[0]).toMatchObject({ fecha: HOY, etiqueta: 'Hoy' })
    expect(agenda[0].visitas.map(x => x.client_name)).toEqual(['Mañana temprano', 'Noche'])
  })
  it('Hoy aparece aunque esté vacío; los demás días solo si tienen visitas, con su nombre', () => {
    const agenda = armarAgenda([
      v({ scheduled_at: '2026-10-16T13:00:00Z' }),
      v({ scheduled_at: '2026-10-18T13:00:00Z' }),
    ], HOY)
    expect(agenda.map(d => [d.fecha, d.etiqueta, d.visitas.length])).toEqual([
      ['2026-10-15', 'Hoy', 0], ['2026-10-16', 'Mañana', 1], ['2026-10-18', 'Dom 18', 1],
    ])
  })
  it('lo que cae fuera de los 7 días no aparece', () => {
    expect(armarAgenda([v({ scheduled_at: '2026-10-25T13:00:00Z' })], HOY)).toEqual([{ fecha: HOY, etiqueta: 'Hoy', visitas: [] }])
  })
})

describe('requierenAccion', () => {
  it('pasaron sin resultado (más recientes primero) y a confirmar futuras (más próximas primero)', () => {
    const r = requierenAccion([
      v({ status: 'scheduled', scheduled_at: '2026-10-10T13:00:00Z', client_name: 'Vieja' }),
      v({ status: 'pending_confirmation', scheduled_at: '2026-10-14T13:00:00Z', client_name: 'Pendiente pasada' }),
      v({ status: 'pending_confirmation', scheduled_at: '2026-10-20T13:00:00Z', client_name: 'A confirmar lejos' }),
      v({ status: 'pending_confirmation', scheduled_at: '2026-10-16T13:00:00Z', client_name: 'A confirmar cerca' }),
      v({ status: 'scheduled', scheduled_at: '2026-10-20T13:00:00Z', client_name: 'Confirmada futura' }),
    ], AHORA)
    expect(r.sinResultado.map(x => x.client_name)).toEqual(['Pendiente pasada', 'Vieja'])
    expect(r.aConfirmar.map(x => x.client_name)).toEqual(['A confirmar cerca', 'A confirmar lejos'])
    expect(r.total).toBe(4)
  })
  it('una visita cerrada nunca requiere acción', () => {
    expect(requierenAccion([v({ status: 'completed', scheduled_at: '2026-10-10T13:00:00Z' })], AHORA).total).toBe(0)
  })
  it('cada lista se corta en 50 pero el total dice la verdad', () => {
    const muchas = Array.from({ length: 60 }, () => v({ status: 'scheduled', scheduled_at: '2026-10-01T13:00:00Z' }))
    const r = requierenAccion(muchas, AHORA)
    expect(r.sinResultado).toHaveLength(50)
    expect(r.total).toBe(60)
  })
})

describe('armarResumen', () => {
  const base = {
    periodo: { desde: '2026-09-16', hasta: HOY }, ahora: AHORA, truncado: false,
    delPeriodo: [v({ status: 'completed', scheduled_at: '2026-10-14T13:00:00Z' })],
    abiertas: [v({ status: 'scheduled', scheduled_at: '2026-10-10T13:00:00Z' })],
    proximas: [
      v({ status: 'scheduled', scheduled_at: '2026-10-15T18:00:00Z' }),
      v({ status: 'cancelled', scheduled_at: '2026-10-15T19:00:00Z' }),
    ],
  }
  it('arma todo y "visitas hoy" no cuenta las canceladas', () => {
    const r = armarResumen({ ...base, verTodo: true })
    expect(r.hoy).toBe(HOY)
    expect(r.visitasHoy).toBe(1)
    expect(r.metricas.agendadas.valor).toBe(1)
    expect(r.requieren.total).toBe(1)
    expect(r.metricas.porAsesor).toHaveLength(1)
    expect(r.propiedades).toEqual([{ id: '33333333-3333-4333-8333-333333333333', direccion: 'Doblas 248' }])
  })
  it('para quien no ve todo, "por asesor" va vacío', () => {
    expect(armarResumen({ ...base, verTodo: false }).metricas.porAsesor).toEqual([])
  })
  it('propaga el aviso de datos truncados', () => {
    expect(armarResumen({ ...base, verTodo: true, truncado: true }).truncado).toBe(true)
  })
})

describe('separarProximasYPasadas', () => {
  it('próximas por horario (más cerca primero) y pasadas de la más reciente a la más vieja', () => {
    const r = separarProximasYPasadas([
      v({ scheduled_at: '2026-10-20T13:00:00Z', client_name: 'Lejos' }),
      v({ scheduled_at: '2026-10-16T13:00:00Z', client_name: 'Cerca', status: 'cancelled' }),
      v({ scheduled_at: '2026-10-01T13:00:00Z', client_name: 'Vieja', status: 'completed' }),
      v({ scheduled_at: '2026-10-14T13:00:00Z', client_name: 'Ayer' }),
    ], AHORA)
    expect(r.proximas.map(x => x.client_name)).toEqual(['Cerca', 'Lejos'])
    expect(r.pasadas.map(x => x.client_name)).toEqual(['Ayer', 'Vieja'])
  })
})

import { describe, it, expect } from 'vitest'
import { tiemposDeVisitas, porOrigen, porAsesor, porPropiedad, calcularMetricas } from './metricas'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const H = 3_600_000
const AHORA = new Date('2026-10-15T15:00:00Z')

describe('tiemposDeVisitas', () => {
  it('anticipación: mediana de scheduled − created; una visita documentada después no cuenta', () => {
    const t = tiemposDeVisitas([
      v({ created_at: '2026-10-10T10:00:00Z', scheduled_at: '2026-10-10T12:00:00Z' }), // 2 h
      v({ created_at: '2026-10-10T10:00:00Z', scheduled_at: '2026-10-10T14:00:00Z' }), // 4 h
      v({ created_at: '2026-10-12T10:00:00Z', scheduled_at: '2026-10-05T14:00:00Z' }), // cargada después
    ])
    expect(t.anticipacion).toEqual({ valor: 3 * H, base: 2, orientativo: true })
  })
  it('confirmación: solo las que nacieron a confirmar (confirmed_at > created_at)', () => {
    const t = tiemposDeVisitas([
      v({ created_at: '2026-10-10T10:00:00.000Z', confirmed_at: '2026-10-10T10:00:00.000Z' }), // nació confirmada
      v({ created_at: '2026-10-10T10:00:00.000Z', confirmed_at: '2026-10-10T16:00:00.000Z' }), // 6 h
      v({ created_at: '2026-10-10T10:00:00.000Z', confirmed_at: null, status: 'pending_confirmation' }),
    ])
    expect(t.confirmacion).toEqual({ valor: 6 * H, base: 1, orientativo: true })
  })
  it('marcar resultado: realizadas y no realizadas; marcada antes del horario cuenta 0; canceladas no', () => {
    const t = tiemposDeVisitas([
      v({ status: 'completed', scheduled_at: '2026-10-10T12:00:00Z', outcome_at: '2026-10-10T20:00:00Z' }), // 8 h
      v({ status: 'no_show', scheduled_at: '2026-10-10T12:00:00Z', outcome_at: '2026-10-10T11:30:00Z' }),  // 0
      v({ status: 'cancelled', scheduled_at: '2026-10-10T12:00:00Z', outcome_at: '2026-10-08T12:00:00Z' }),
    ])
    expect(t.marcarResultado).toEqual({ valor: 4 * H, base: 2, orientativo: true })
  })
  it('de la consulta a la visita: consulta de portal; registro previo; registro nacido con la visita NO', () => {
    const t = tiemposDeVisitas([
      v({ created_at: '2026-10-10T12:00:00Z', consulta_recibida_at: '2026-10-09T12:00:00Z', registro_creado_at: '2026-10-10T11:59:59Z' }), // 24 h (manda la consulta)
      v({ created_at: '2026-10-10T12:00:00Z', registro_creado_at: '2026-10-08T12:00:00Z' }),  // 48 h
      v({ created_at: '2026-10-10T12:00:00Z', registro_creado_at: '2026-10-10T11:59:30Z' }),  // nació con la visita
      v({ created_at: '2026-10-10T12:00:00Z', registro_creado_at: null }),                     // sin persona vinculada
    ])
    expect(t.consultaAVisita).toEqual({ valor: 36 * H, base: 2, orientativo: true })
  })
  it('sin visitas: los cuatro tiempos sin datos', () => {
    const t = tiemposDeVisitas([])
    expect([t.anticipacion, t.confirmacion, t.marcarResultado, t.consultaAVisita].every(c => c.valor === null)).toBe(true)
  })
})

describe('agrupaciones', () => {
  const visitas = [
    v({ origin: 'portal', status: 'completed', advisor_id: null, asesor_nombre: null }),
    v({ origin: 'portal', status: 'no_show', outcome_reason: 'no_vino' }),
    v({ origin: 'portal', status: 'scheduled' }),
    v({ origin: null, status: 'cancelled', property_id: '44444444-4444-4444-8444-444444444444', direccion: null }),
  ]
  it('por origen: cantidad y % realizado con su base; las viejas en "Sin origen"', () => {
    expect(porOrigen(visitas)).toEqual([
      { clave: 'portal', etiqueta: 'Consulta de portal', cantidad: 3, realizado: { valor: 50, base: 2, orientativo: true } },
      { clave: 'sin_origen', etiqueta: 'Sin origen', cantidad: 1, realizado: { valor: 0, base: 1, orientativo: true } },
    ])
  })
  it('por asesor: sin asesor no rompe', () => {
    expect(porAsesor(visitas).map(f => [f.etiqueta, f.cantidad])).toEqual([['Lucas Pérez', 3], ['Sin asesor', 1]])
  })
  it('por propiedad: sin dirección no rompe', () => {
    expect(porPropiedad(visitas).map(f => [f.etiqueta, f.cantidad])).toEqual([['Doblas 248', 3], ['Propiedad sin dirección', 1]])
  })
  it('un grupo sin ningún resultado dice sin datos en el %', () => {
    expect(porOrigen([v({ origin: 'cartel', status: 'scheduled' })])[0].realizado.valor).toBeNull()
  })
})

describe('calcularMetricas', () => {
  it('junta conteos, tiempos, embudo y grupos', () => {
    const m = calcularMetricas([v({ status: 'completed', scheduled_at: '2026-10-14T13:30:00Z' })], AHORA)
    expect(m.agendadas.valor).toBe(1)
    expect(m.realizadas.valor).toBe(100)
    expect(m.embudo).toHaveLength(5)
    expect(m.porOrigen[0].clave).toBe('cartel')
    expect(m.tiempos.anticipacion.base).toBe(1)
  })
  it('rendimiento: 20.000 visitas en menos de 150 ms (spec §8)', () => {
    const estados = ['pending_confirmation', 'scheduled', 'completed', 'no_show', 'cancelled'] as const
    const origenes = ['portal', 'publicidad_meta', 'publicidad_paga', 'cartel', 'otro', null] as const
    const base = Date.parse('2026-01-01T12:00:00Z')
    const muchas = Array.from({ length: 20_000 }, (_, i) => v({
      status: estados[i % 5],
      origin: origenes[i % 6],
      advisor_id: `22222222-2222-4222-8222-${String(i % 12).padStart(12, '0')}`,
      asesor_nombre: `Asesor ${i % 12}`,
      property_id: `33333333-3333-4333-8333-${String(i % 300).padStart(12, '0')}`,
      direccion: `Calle ${i % 300}`,
      created_at: new Date(base + i * 60_000).toISOString(),
      scheduled_at: new Date(base + i * 60_000 + 86_400_000).toISOString(),
      confirmed_at: i % 3 ? new Date(base + i * 60_000 + 3_600_000).toISOString() : null,
      outcome_at: new Date(base + i * 60_000 + 90_000_000).toISOString(),
      outcome_reason: i % 5 === 3 ? 'no_vino' : null,
      consulta_recibida_at: i % 2 ? new Date(base + i * 60_000 - 86_400_000).toISOString() : null,
    }))
    calcularMetricas(muchas, AHORA) // calienta el JIT
    let mejor = Infinity
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now()
      calcularMetricas(muchas, AHORA)
      mejor = Math.min(mejor, performance.now() - t0)
    }
    expect(mejor).toBeLessThan(150)
  })
})

describe('tiempo de respuesta de la encuesta', () => {
  it('de enviada a respondida; sin envío no cuenta', () => {
    const enc = { expires_at: '2026-11-13T18:00:00Z', liked: true, price_opinion: null, offer_amount: null, offer_currency: null,
      offer_declined: true, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null }
    const t = tiemposDeVisitas([
      v({ status: 'completed', encuesta: { ...enc, sent_at: '2026-10-14T18:00:00Z', completed_at: '2026-10-14T20:00:00Z' } }),
      v({ status: 'completed', encuesta: { ...enc, sent_at: null, completed_at: '2026-10-14T20:00:00Z' } }),
    ])
    expect(t.respuestaEncuesta).toEqual({ valor: 7_200_000, base: 1, orientativo: true })
  })
})

import { describe, expect, it } from 'vitest'
import {
  INICIO_MEDICION_LLAMADAS,
  intentosDeSolicitud,
  mediana,
  metricasLlamadas,
  type IntentoMedido,
  type SolicitudMedida,
} from './metricas-llamadas'

const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`).toISOString()

const sol = (id: string, creadoEn: string, contactId: string | null = `c-${id}`): SolicitudMedida => ({ dealId: id, contactId, creadoEn })
let seq = 0
const llamada = (deal: string | null, contact: string, cuando: string, resultado: string, o: Partial<IntentoMedido> = {}): IntentoMedido => ({
  id: `a${++seq}`, deal_id: deal, contact_id: contact, kind: 'call', call_outcome: resultado, occurred_at: cuando, created_at: cuando, voided_at: null, ...o,
})
const whatsapp = (deal: string | null, contact: string, cuando: string): IntentoMedido => ({
  id: `a${++seq}`, deal_id: deal, contact_id: contact, kind: 'whatsapp_sent', call_outcome: null, occurred_at: cuando, created_at: cuando, voided_at: null,
})

describe('inicio de la medición', () => {
  it('es el 26/11/2026 a las 21:04 de Argentina', () => {
    expect(INICIO_MEDICION_LLAMADAS).toBe('2026-11-27T00:04:52.000Z')
    expect(Date.parse(INICIO_MEDICION_LLAMADAS) - Date.parse(ar('2026-11-26', '21:04'))).toBe(52_000)
  })
})

describe('mediana', () => {
  it('impar, par y vacía', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 2, 3])).toBe(2.5)
    expect(mediana([])).toBeNull()
  })
})

describe('intentosDeSolicitud', () => {
  const s = sol('d1', ar('2026-11-30', '10:00'))
  it('del proceso, o sin proceso del mismo contacto; desde que se creó la solicitud; sin anulados ni otros procesos; por la hora', () => {
    const r = intentosDeSolicitud(s, [
      llamada('d1', 'c-d1', ar('2026-11-30', '12:00'), 'no_atendio', { id: 'segunda' }),
      llamada(null, 'c-d1', ar('2026-11-30', '11:00'), 'no_atendio', { id: 'primera' }),
      llamada(null, 'c-d1', ar('2026-11-29', '11:00'), 'agendo', { id: 'de-antes' }),
      llamada('otro', 'c-d1', ar('2026-11-30', '13:00'), 'agendo', { id: 'otro-proceso' }),
      llamada('d1', 'c-d1', ar('2026-11-30', '14:00'), 'agendo', { id: 'anulada', voided_at: ar('2026-11-30', '14:05') }),
      llamada(null, 'c-otro', ar('2026-11-30', '11:30'), 'agendo', { id: 'otro-contacto' }),
    ])
    expect(r.map((x) => x.id)).toEqual(['primera', 'segunda'])
  })
  it('ligada al proceso con la hora corregida antes del registro: no cuenta', () => {
    const r = intentosDeSolicitud(s, [llamada('d1', 'c-d1', ar('2026-11-30', '09:50'), 'no_atendio', { id: 'x' })])
    expect(r).toEqual([])
  })
  it('sin contacto, solo por proceso', () => {
    const r = intentosDeSolicitud(sol('d2', ar('2026-11-30', '10:00'), null), [
      llamada('d2', 'c-z', ar('2026-11-30', '11:00'), 'agendo', { id: 'si' }),
      llamada(null, 'c-z', ar('2026-11-30', '11:00'), 'agendo', { id: 'no' }),
      llamada('d2', 'c-z', ar('2026-11-30', '09:00'), 'agendo', { id: 'antes' }),
    ])
    expect(r.map((x) => x.id)).toEqual(['si'])
  })
  it('a igual hora, desempata por cuándo se cargó', () => {
    const t = ar('2026-11-30', '11:00')
    const r = intentosDeSolicitud(s, [
      llamada('d1', 'c-d1', t, 'agendo', { id: 'b', created_at: ar('2026-11-30', '11:02') }),
      llamada('d1', 'c-d1', t, 'no_atendio', { id: 'a', created_at: ar('2026-11-30', '11:01') }),
    ])
    expect(r.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('metricasLlamadas', () => {
  // Lunes 30/11/2026.
  const a = sol('a', ar('2026-11-30', '10:00')) // llamada a la hora: atendió y agendó en la 1
  const b = sol('b', ar('2026-11-30', '10:00')) // 1 no atendió (13:00), 2 agendó (martes 10:00)
  const c = sol('c', ar('2026-11-30', '17:00')) // 1 número equivocado al día siguiente 9:30
  const d = sol('d', ar('2026-11-30', '10:00')) // solo WhatsApp
  const e = sol('e', ar('2026-11-30', '10:00')) // nada
  const intentos = [
    llamada('a', 'c-a', ar('2026-11-30', '11:00'), 'agendo'),
    llamada('b', 'c-b', ar('2026-11-30', '13:00'), 'no_atendio'),
    llamada('b', 'c-b', ar('2026-12-01', '10:00'), 'agendo'),
    llamada('c', 'c-c', ar('2026-12-01', '09:30'), 'numero_equivocado'),
    whatsapp('d', 'c-d', ar('2026-11-30', '12:00')),
  ]
  const m = metricasLlamadas([a, b, c, d, e], intentos)

  it('cuenta las solicitudes y las que no tienen ningún intento', () => {
    expect(m.solicitudes).toBe(5)
    expect(m.sinIntento).toBe(1)
    expect(m.llamadas).toBe(4)
  })

  it('tiempo a la primera llamada: mediana y promedio, reloj y hábiles, sobre las que tienen llamada', () => {
    // a: 60 min reloj / 60 hábiles · b: 180 / 180 · c: 16 h 30 = 990 reloj / 90 hábiles (17-18 y 9-9:30)
    expect(m.primeraLlamada).toEqual({
      n: 3, sinCaso: 2,
      medianaReloj: 180, promedioReloj: (60 + 180 + 990) / 3,
      medianaHabiles: 90, promedioHabiles: (60 + 180 + 90) / 3,
    })
  })

  it('de la primera a la segunda llamada', () => {
    // b: lunes 13:00 → martes 10:00 = 21 h reloj; hábiles 13-18 (300) + 9-10 (60) = 360
    expect(m.primeraASegunda).toEqual({ n: 1, sinCaso: 2, medianaReloj: 1260, promedioReloj: 1260, medianaHabiles: 360, promedioHabiles: 360 })
  })

  it('contactados y agendados, con el intento', () => {
    expect(m.contactados).toEqual({ n: 2, de: 5 })
    expect(m.agendados).toEqual({ n: 2, de: 5 })
    expect(m.intentosHastaAtender).toEqual({ n: 2, promedio: 1.5, reparto: [{ intento: '1', n: 1 }, { intento: '2', n: 1 }, { intento: '3', n: 0 }, { intento: '4 o más', n: 0 }] })
    expect(m.agendoEnLlamada).toEqual({ n: 2, promedio: 1.5, reparto: [{ intento: '1', n: 1 }, { intento: '2', n: 1 }, { intento: '3', n: 0 }, { intento: '4 o más', n: 0 }] })
  })

  it('resultados en orden fijo, con los que no hubo en cero', () => {
    expect(m.resultados).toEqual([
      { resultado: 'no_atendio', n: 1 },
      { resultado: 'agendo', n: 2 },
      { resultado: 'volver_a_llamar', n: 0 },
      { resultado: 'no_interesa', n: 0 },
      { resultado: 'numero_equivocado', n: 1 },
    ])
  })

  it('"volver a llamar" y "no le interesa" son contactados pero no agendados; 4 o más intentos', () => {
    const s = sol('x', ar('2026-11-30', '10:00'))
    const r = metricasLlamadas([s], [
      llamada('x', 'c-x', ar('2026-11-30', '10:10'), 'no_atendio'),
      llamada('x', 'c-x', ar('2026-11-30', '10:20'), 'no_atendio'),
      llamada('x', 'c-x', ar('2026-11-30', '10:30'), 'numero_equivocado'),
      llamada('x', 'c-x', ar('2026-11-30', '10:40'), 'no_atendio'),
      llamada('x', 'c-x', ar('2026-11-30', '10:50'), 'volver_a_llamar'),
    ])
    expect(r.contactados).toEqual({ n: 1, de: 1 })
    expect(r.agendados).toEqual({ n: 0, de: 1 })
    expect(r.intentosHastaAtender.reparto.at(-1)).toEqual({ intento: '4 o más', n: 1 })
    expect(r.intentosHastaAtender.promedio).toBe(5)
    expect(r.agendoEnLlamada).toEqual({ n: 0, promedio: null, reparto: [{ intento: '1', n: 0 }, { intento: '2', n: 0 }, { intento: '3', n: 0 }, { intento: '4 o más', n: 0 }] })
  })

  it('sin solicitudes, todo en cero o sin dato (nunca NaN)', () => {
    const r = metricasLlamadas([], [])
    expect(r.solicitudes).toBe(0)
    expect(r.primeraLlamada).toEqual({ n: 0, sinCaso: 0, medianaReloj: null, promedioReloj: null, medianaHabiles: null, promedioHabiles: null })
    expect(r.intentosHastaAtender.promedio).toBeNull()
  })

  it('una llamada que no es de ninguna solicitud del período no cuenta en los resultados', () => {
    const r = metricasLlamadas([a], [llamada('zz', 'c-zz', ar('2026-11-30', '11:00'), 'agendo')])
    expect(r.llamadas).toBe(0)
    expect(r.resultados.every((x) => x.n === 0)).toBe(true)
  })
})

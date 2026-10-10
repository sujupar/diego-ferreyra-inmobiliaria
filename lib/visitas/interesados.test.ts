import { describe, it, expect } from 'vitest'
import { interesadosParaOrigen, filtrarInteresados, MAX_INTERESADOS } from './interesados'
import type { ConsultaR, RegistroR, VisitaActivaR } from './tipos'

const consulta = (p: Partial<ConsultaR>): ConsultaR => ({
  id: 'c', lead_name: 'Ana', lead_phone: '1158234521', lead_email: null, portal: 'zonaprop',
  received_at: '2026-10-08T12:00:00Z', created_at: '2026-10-08T12:00:00Z', ...p,
})
const registro = (p: Partial<RegistroR>): RegistroR => ({
  id: 'r', name: 'Beto', phone: '1144445555', email: null, source: 'landing', utm: {},
  created_at: '2026-10-08T12:00:00Z', suspected_bot: false, deleted_at: null, ...p,
})
const sinDatos = { consultas: [] as ConsultaR[], registros: [] as RegistroR[], visitasActivas: [] as VisitaActivaR[] }

describe('interesadosParaOrigen — portal', () => {
  it('lista las consultas, la más reciente primero, con el portal legible', () => {
    const r = interesadosParaOrigen('portal', { ...sinDatos, consultas: [
      consulta({ id: 'c1', lead_name: 'Vieja', lead_phone: '1111111111', received_at: '2026-10-01T12:00:00Z' }),
      consulta({ id: 'c2', lead_name: 'Nueva', lead_phone: '2222222222', received_at: '2026-10-09T12:00:00Z', portal: 'argenprop' }),
    ] })
    expect(r.map(i => i.nombre)).toEqual(['Nueva', 'Vieja'])
    expect(r[0]).toMatchObject({ clave: 'consulta:c2', tipo: 'consulta', detalle: 'Argenprop', tieneTelefono: true })
  })
  it('el MISMO teléfono en otro formato es UNA persona (con la cuenta de consultas)', () => {
    const r = interesadosParaOrigen('portal', { ...sinDatos, consultas: [
      consulta({ id: 'c1', lead_phone: '+54 9 11 5823-4521', received_at: '2026-10-09T12:00:00Z' }),
      consulta({ id: 'c2', lead_phone: '011 5823 4521', received_at: '2026-10-01T12:00:00Z' }),
    ] })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'c1', consultas: 2 })
  })
  it('sin teléfono no se deduplica y queda marcado', () => {
    const r = interesadosParaOrigen('portal', { ...sinDatos, consultas: [
      consulta({ id: 'c1', lead_phone: null, lead_name: null }), consulta({ id: 'c2', lead_phone: null }),
    ] })
    expect(r).toHaveLength(2)
    expect(r.find(i => i.id === 'c1')).toMatchObject({ tieneTelefono: false, nombre: 'Sin nombre' })
  })
  it('marca a quien ya tiene una visita activa (por teléfono)', () => {
    const r = interesadosParaOrigen('portal', {
      ...sinDatos,
      consultas: [consulta({ id: 'c1', lead_phone: '1158234521' })],
      visitasActivas: [{ id: 'v1', lead_id: null, client_phone: '+5491158234521', scheduled_at: '2026-10-12T14:00:00Z', status: 'scheduled' }],
    })
    expect(r[0].visitaActiva).toEqual({ id: 'v1', scheduled_at: '2026-10-12T14:00:00Z' })
  })
})

describe('interesadosParaOrigen — publicidad', () => {
  const registros = [
    registro({ id: 'r1', name: 'De Google', utm: { gclid: 'x' }, created_at: '2026-10-09T12:00:00Z', phone: '1100000001' }),
    registro({ id: 'r2', name: 'De Meta', utm: { utm_source: 'meta' }, created_at: '2026-10-01T12:00:00Z', phone: '1100000002' }),
    registro({ id: 'r3', name: 'Bot', suspected_bot: true, phone: '1100000003' }),
    registro({ id: 'r4', name: 'Borrado', deleted_at: '2026-10-02T00:00:00Z', phone: '1100000004' }),
    registro({ id: 'r5', name: 'Portal', source: 'portal:zonaprop', phone: '1100000005' }),
  ]
  it('con origen Meta, los de Meta primero; sin bots, borrados ni registros de portal', () => {
    const r = interesadosParaOrigen('publicidad_meta', { ...sinDatos, registros })
    expect(r.map(i => i.nombre)).toEqual(['De Meta', 'De Google'])
    expect(r[0]).toMatchObject({ coincideConElOrigen: true, detalle: 'Publicidad de Meta' })
    expect(r[1]).toMatchObject({ coincideConElOrigen: false, detalle: 'Otra publicidad paga · Google' })
  })
  it('con otra publicidad paga, Google primero', () => {
    const r = interesadosParaOrigen('publicidad_paga', { ...sinDatos, registros })
    expect(r[0].nombre).toBe('De Google')
  })
  it('marca visita activa por lead_id', () => {
    const r = interesadosParaOrigen('publicidad_meta', {
      ...sinDatos, registros: [registro({ id: 'r2', utm: { utm_source: 'meta' } })],
      visitasActivas: [{ id: 'v9', lead_id: 'r2', client_phone: null, scheduled_at: '2026-10-12T14:00:00Z', status: 'pending_confirmation' }],
    })
    expect(r[0].visitaActiva?.id).toBe('v9')
  })
})

describe('otros orígenes y límites', () => {
  it('cartel y otro no tienen lista (se carga a mano)', () => {
    expect(interesadosParaOrigen('cartel', { ...sinDatos, consultas: [consulta({})] })).toEqual([])
    expect(interesadosParaOrigen('otro', sinDatos)).toEqual([])
  })
  it('nunca devuelve más de MAX_INTERESADOS', () => {
    const muchas = Array.from({ length: 500 }, (_, i) => consulta({ id: `c${i}`, lead_phone: String(1100000000 + i) }))
    expect(interesadosParaOrigen('portal', { ...sinDatos, consultas: muchas })).toHaveLength(MAX_INTERESADOS)
  })
})

describe('filtrarInteresados', () => {
  const lista = interesadosParaOrigen('portal', { ...sinDatos, consultas: [
    consulta({ id: 'c1', lead_name: 'María López', lead_phone: '1158234521' }),
    consulta({ id: 'c2', lead_name: 'Juan Pérez', lead_phone: '1144445555' }),
  ] })
  it('sin tildes encuentra con tildes, y al revés en NFD', () => {
    expect(filtrarInteresados(lista, 'lopez').map(i => i.id)).toEqual(['c1'])
    expect(filtrarInteresados(lista, 'Pérez').map(i => i.id)).toEqual(['c2'])
  })
  it('busca por teléfono ignorando formato', () => {
    expect(filtrarInteresados(lista, '15 5823-4521').map(i => i.id)).toEqual(['c1'])
  })
  it('texto vacío devuelve la lista entera', () => {
    expect(filtrarInteresados(lista, '  ')).toHaveLength(2)
  })
})

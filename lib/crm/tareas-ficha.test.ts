import { describe, it, expect } from 'vitest'
import { enlaceTareaCadencia, tareasVisiblesEnFicha, vencimientoDeTarea } from './tareas-ficha'

const t = (id: string, type: string, deal_id: string | null, assigned_to: string | null) => ({ id, type, deal_id, assigned_to })
const ids = (lista: { id: string }[]) => lista.map((x) => x.id)
const base = { dealsConTasacionAgendada: [] as string[], dealsOcultos: [] as string[], usuarioId: 'yo', soloPropiasSinProceso: false }

describe('tareasVisiblesEnFicha', () => {
  it('saca la new_assignment de un proceso con tasación agendada', () => {
    const r = tareasVisiblesEnFicha([t('a', 'new_assignment', 'd1', 'yo'), t('b', 'follow_up', 'd1', 'yo')], {
      ...base,
      dealsConTasacionAgendada: ['d1'],
    })
    expect(ids(r)).toEqual(['b'])
  })
  it('deja la new_assignment de un proceso sin tasación agendada', () => {
    const r = tareasVisiblesEnFicha([t('a', 'new_assignment', 'd2', 'yo')], { ...base, dealsConTasacionAgendada: ['d1'] })
    expect(ids(r)).toEqual(['a'])
  })
  it('saca las tareas de los procesos ocultos (asesor)', () => {
    const r = tareasVisiblesEnFicha([t('a', 'update_contact', 'ajeno', 'coord'), t('b', 'follow_up', 'mio', 'yo')], {
      ...base,
      dealsOcultos: ['ajeno'],
    })
    expect(ids(r)).toEqual(['b'])
  })
  it('nunca saca una tarea asignada a quien mira, aunque su proceso esté oculto (de otro asesor)', () => {
    const r = tareasVisiblesEnFicha([t('a', 'follow_up', 'de-asesor-A', 'yo')], { ...base, dealsOcultos: ['de-asesor-A'] })
    expect(ids(r)).toEqual(['a'])
  })
  it('nunca saca una tarea asignada a quien mira sobre un proceso sin asesor', () => {
    const r = tareasVisiblesEnFicha([t('a', 'follow_up', 'sin-asesor', 'yo')], { ...base, dealsOcultos: ['sin-asesor'] })
    expect(ids(r)).toEqual(['a'])
  })
  it('con soloPropiasSinProceso saca las ligadas solo al contacto que son de otros y deja las suyas', () => {
    const r = tareasVisiblesEnFicha(
      [t('coord', 'follow_up', null, 'coordinadora'), t('otro', 'follow_up', null, 'otro-asesor'), t('mia', 'follow_up', null, 'yo'), t('nadie', 'follow_up', null, null)],
      { ...base, soloPropiasSinProceso: true },
    )
    expect(ids(r)).toEqual(['mia'])
  })
  it('sin soloPropiasSinProceso (coordinadora) deja las dos', () => {
    const r = tareasVisiblesEnFicha([t('coord', 'follow_up', null, 'coordinadora'), t('otro', 'follow_up', null, 'otro-asesor')], base)
    expect(ids(r)).toEqual(['coord', 'otro'])
  })
  it('con las dos listas vacías y sin soloPropias no saca nada', () => {
    const lista = [t('a', 'new_assignment', 'd1', 'x'), t('b', 'update_contact', null, null)]
    expect(tareasVisiblesEnFicha(lista, base)).toEqual(lista)
  })
  it('lista vacía → vacía', () => {
    expect(tareasVisiblesEnFicha([], base)).toEqual([])
  })
})

describe('vencimientoDeTarea', () => {
  // 22:00 de Argentina del miércoles 25 = 01:00 UTC del jueves 26.
  const noche = new Date('2026-11-26T01:00:00Z')

  it('a las 22:00 de Argentina, una tarea para mañana a las 9:00 no está vencida', () => {
    expect(vencimientoDeTarea({ due_date: '2026-11-26', due_time: '09:00:00' }, noche)).toEqual({ vencida: false, dias: null })
  })
  it('a las 22:00 de Argentina, una de anteayer da 2 días (no 3)', () => {
    expect(vencimientoDeTarea({ due_date: '2026-11-23', due_time: '09:00:00' }, noche)).toEqual({ vencida: true, dias: 2 })
  })
  it('con fecha y hora: vence cuando ese momento de Argentina pasó (hoy, 0 días)', () => {
    expect(vencimientoDeTarea({ due_date: '2026-11-25', due_time: '21:00' }, noche)).toEqual({ vencida: true, dias: 0 })
  })
  it('con fecha y hora: todavía no pasó', () => {
    expect(vencimientoDeTarea({ due_date: '2026-11-25', due_time: '23:00' }, noche)).toEqual({ vencida: false, dias: null })
  })
  it('con fecha sola: hoy no está vencida', () => {
    expect(vencimientoDeTarea({ due_date: '2026-11-25', due_time: null }, noche)).toEqual({ vencida: false, dias: null })
  })
  it('con fecha sola: ayer sí, recién al día siguiente', () => {
    expect(vencimientoDeTarea({ due_date: '2026-11-24', due_time: null }, noche)).toEqual({ vencida: true, dias: 1 })
  })
  it('sin fecha nunca vence', () => {
    expect(vencimientoDeTarea({ due_date: null, due_time: '09:00' }, noche)).toEqual({ vencida: false, dias: null })
  })
  it('con fecha inválida no vence (no rompe la lista)', () => {
    expect(vencimientoDeTarea({ due_date: 'mañana', due_time: null }, noche)).toEqual({ vencida: false, dias: null })
  })
})

// Tarea 11.3 (D5): una tarea de la cadencia abierta desde /tasks lleva a la ficha, donde
// se registra la llamada; cualquier otra, `null` (y /tasks sigue como hoy).
describe('enlaceTareaCadencia', () => {
  const t = (c: Partial<Parameters<typeof enlaceTareaCadencia>[0]> = {}) =>
    enlaceTareaCadencia({ type: 'follow_up', source_activity_id: 'a-1', contact_id: 'c-1', deal_id: 'd-1', ...c })

  it('follow_up de la cadencia con proceso → la ficha del contacto', () => {
    expect(t()).toBe('/contacts/c-1')
  })
  it('follow_up de la cadencia sin proceso → la ficha del contacto', () => {
    expect(t({ deal_id: null })).toBe('/contacts/c-1')
  })
  it('follow_up creada a mano sobre un proceso → null', () => {
    expect(t({ source_activity_id: null })).toBeNull()
  })
  it.each(['update_contact', 'new_assignment'])('%s → null', (type) => {
    expect(t({ type })).toBeNull()
  })
  it('de la cadencia pero sin contacto → null', () => {
    expect(t({ contact_id: null })).toBeNull()
  })
  it('campos que faltan (una tarea vieja sin la columna) → null', () => {
    expect(enlaceTareaCadencia({ type: 'follow_up', contact_id: 'c-1', deal_id: 'd-1' })).toBeNull()
  })
})

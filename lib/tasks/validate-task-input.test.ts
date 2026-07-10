import { describe, it, expect } from 'vitest'
import { validateTaskInput } from './validate-task-input'

const USER = { id: 'u1', role: 'asesor' }
const ADMIN = { id: 'a1', role: 'admin' }
const TODAY = '2026-07-10'

function base() {
  return { type: 'follow_up', title: 'Llamar a Juan', channel: 'call', due_date: '2026-07-11', all_day: true }
}

describe('validateTaskInput', () => {
  it('acepta un follow_up mínimo y auto-asigna al creador', () => {
    const r = validateTaskInput(base(), USER, TODAY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.assigned_to).toBe('u1')
      expect(r.value.created_by).toBe('u1')
      expect(r.value.type).toBe('follow_up')
      expect(r.value.all_day).toBe(true)
      expect(r.value.due_time).toBeNull()
    }
  })

  it('rechaza título vacío', () => {
    const r = validateTaskInput({ ...base(), title: '  ' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('rechaza canal inválido', () => {
    const r = validateTaskInput({ ...base(), channel: 'carta' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('acepta los tipos nuevos (visit/document/other)', () => {
    for (const c of ['visit', 'document', 'other']) {
      expect(validateTaskInput({ ...base(), channel: c }, USER, TODAY).ok).toBe(true)
    }
  })

  it('rechaza fecha anterior a hoy', () => {
    const r = validateTaskInput({ ...base(), due_date: '2026-07-09' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('exige hora si no es all_day', () => {
    const r = validateTaskInput({ ...base(), all_day: false, due_time: '' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('normaliza due_time a null cuando all_day', () => {
    const r = validateTaskInput({ ...base(), all_day: true, due_time: '10:00' }, USER, TODAY)
    expect(r.ok && r.value.due_time).toBeNull()
  })

  it('conserva due_time cuando no es all_day', () => {
    const r = validateTaskInput({ ...base(), all_day: false, due_time: '10:30' }, USER, TODAY)
    expect(r.ok && r.value.due_time).toBe('10:30')
  })

  it('fuerza type=follow_up aunque el cliente mande otro', () => {
    const r = validateTaskInput({ ...base(), type: 'new_assignment' }, USER, TODAY)
    expect(r.ok && r.value.type).toBe('follow_up')
  })

  it('acepta a lo sumo una entidad', () => {
    const r = validateTaskInput({ ...base(), deal_id: 'd1', property_id: 'p1' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('mapea la entidad única', () => {
    const r = validateTaskInput({ ...base(), property_id: 'p1' }, USER, TODAY)
    expect(r.ok && r.value.property_id).toBe('p1')
    expect(r.ok && r.value.deal_id).toBeNull()
  })

  it('asesor NO puede asignar a otro usuario (403)', () => {
    const r = validateTaskInput({ ...base(), assigned_to: 'otro' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 403 })
  })

  it('admin puede asignar a otro usuario', () => {
    const r = validateTaskInput({ ...base(), assigned_to: 'otro' }, ADMIN, TODAY)
    expect(r.ok && r.value.assigned_to).toBe('otro')
    expect(r.ok && r.value.created_by).toBe('a1')
  })

  it('asignarse a sí mismo explícito es válido para cualquier rol', () => {
    const r = validateTaskInput({ ...base(), assigned_to: 'u1' }, USER, TODAY)
    expect(r.ok && r.value.assigned_to).toBe('u1')
  })
})

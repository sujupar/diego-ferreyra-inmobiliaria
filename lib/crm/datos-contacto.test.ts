import { describe, it, expect } from 'vitest'
import { sanearDatosContacto, soloLoPropio, ORIGENES_CONTACTO } from './datos-contacto'

const UUID = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e'
const editar = (body: unknown, puedeReasignar = false) => sanearDatosContacto(body, { modo: 'editar', puedeReasignar })
const crear = (body: unknown, puedeReasignar = false) => sanearDatosContacto(body, { modo: 'crear', puedeReasignar })

describe('ORIGENES_CONTACTO', () => {
  it('son los cuatro del CHECK de contacts.origin', () => {
    expect([...ORIGENES_CONTACTO]).toEqual(['embudo', 'referido', 'historico', 'clase_gratuita'])
  })
})

describe('sanearDatosContacto (editar, parcial)', () => {
  it('{ notes } solo → cambia solo notes', () => {
    expect(editar({ notes: 'Background' })).toEqual({ ok: true, cambios: { notes: 'Background' } })
  })
  it('cuerpo vacío → 400', () => {
    expect(editar({})).toEqual({ ok: false, error: 'No hay nada para guardar.' })
  })
  it('solo campos desconocidos → 400', () => {
    expect(editar({ foo: 1, created_by: 'x' }).ok).toBe(false)
  })
  it('cuerpo que no es un objeto → 400', () => {
    expect(editar(null).ok).toBe(false)
    expect(editar('texto').ok).toBe(false)
    expect(editar([]).ok).toBe(false)
  })
  it('full_name vacío → 400', () => {
    expect(editar({ full_name: '   ' })).toEqual({ ok: false, error: 'El nombre no puede quedar vacío.' })
  })
  it('full_name que no es texto → 400', () => {
    expect(editar({ full_name: 42 }).ok).toBe(false)
  })
  it('assigned_to de quien no puede reasignar se descarta junto con otro campo', () => {
    expect(editar({ assigned_to: UUID, notes: 'x' })).toEqual({ ok: true, cambios: { notes: 'x' } })
  })
  it('assigned_to solo, de quien no puede reasignar → 400 (no queda nada)', () => {
    expect(editar({ assigned_to: UUID }).ok).toBe(false)
  })
  it('created_by nunca pasa', () => {
    expect(editar({ created_by: UUID, notes: 'x' }, true)).toEqual({ ok: true, cambios: { notes: 'x' } })
  })
  it('el cuerpo exacto de ContactEditor con nulls → todo null salvo el nombre', () => {
    expect(editar({ full_name: 'Ana', phone: null, email: null, origin: null, notes: null })).toEqual({
      ok: true,
      cambios: { full_name: 'Ana', phone: null, email: null, origin: null, notes: null },
    })
  })
  it('el mismo cuerpo con textos vacíos → se guardan como null', () => {
    expect(editar({ full_name: 'Ana', phone: '', email: ' ', origin: '', notes: '' })).toEqual({
      ok: true,
      cambios: { full_name: 'Ana', phone: null, email: null, origin: null, notes: null },
    })
  })
  it('no valida el formato del email ni del teléfono (un email viejo mal cargado no traba la edición)', () => {
    expect(editar({ full_name: 'Ana', phone: '11 5555-5555', email: 'ana(at)mal', origin: 'referido', notes: null })).toEqual({
      ok: true,
      cambios: { full_name: 'Ana', phone: '11 5555-5555', email: 'ana(at)mal', origin: 'referido', notes: null },
    })
  })
  it('recorta espacios y normaliza a NFC', () => {
    expect(editar({ full_name: '  José  ' })).toEqual({ ok: true, cambios: { full_name: 'José' } })
  })
  it('tope de 200 en nombre, teléfono y email', () => {
    expect(editar({ full_name: 'a'.repeat(200) }).ok).toBe(true)
    expect(editar({ full_name: 'a'.repeat(201) }).ok).toBe(false)
    expect(editar({ phone: '1'.repeat(201) }).ok).toBe(false)
    expect(editar({ email: 'e'.repeat(201) }).ok).toBe(false)
  })
  it('tope de 10.000 en notes', () => {
    expect(editar({ notes: 'n'.repeat(10_000) }).ok).toBe(true)
    expect(editar({ notes: 'n'.repeat(10_001) }).ok).toBe(false)
  })
  it('origin fuera de la lista → 400 "Origen no válido"', () => {
    expect(editar({ origin: 'tasacion' })).toEqual({ ok: false, error: 'Origen no válido.' })
  })
  it('assigned_to de un coordinador con algo que no es un id → 400 "Ese usuario no existe"', () => {
    expect(editar({ assigned_to: 'Lucas' }, true)).toEqual({ ok: false, error: 'Ese usuario no existe.' })
  })
  it('assigned_to vacío de un coordinador → sin asesor', () => {
    expect(editar({ assigned_to: '' }, true)).toEqual({ ok: true, cambios: { assigned_to: null } })
    expect(editar({ assigned_to: null }, true)).toEqual({ ok: true, cambios: { assigned_to: null } })
  })
  it('assigned_to válido de un coordinador pasa', () => {
    expect(editar({ assigned_to: UUID }, true)).toEqual({ ok: true, cambios: { assigned_to: UUID } })
  })
  it('caracteres especiales de regex en notas pasan tal cual', () => {
    expect(editar({ notes: '(.*)[a-z]+$' })).toEqual({ ok: true, cambios: { notes: '(.*)[a-z]+$' } })
  })
})

describe('sanearDatosContacto (crear)', () => {
  it('exige el nombre', () => {
    expect(crear({ phone: '11' })).toEqual({ ok: false, error: 'El nombre es obligatorio.' })
  })
  it('arma solo la lista cerrada y descarta lo desconocido', () => {
    expect(crear({ full_name: 'Ana', phone: '11', foo: 'bar', created_by: UUID })).toEqual({
      ok: true,
      cambios: { full_name: 'Ana', phone: '11' },
    })
  })
  it('assigned_to de quien no puede reasignar se descarta', () => {
    expect(crear({ full_name: 'Ana', assigned_to: UUID })).toEqual({ ok: true, cambios: { full_name: 'Ana' } })
  })
})

describe('soloLoPropio', () => {
  const datos = {
    contact: { id: 'c1' },
    deals: [
      { id: 'd1', assigned_to: 'yo' },
      { id: 'd2', assigned_to: 'otro' },
      { id: 'd3', assigned_to: null },
    ],
    appraisals: [
      { id: 'a1', assigned_to: null, user_id: 'yo' },
      { id: 'a2', assigned_to: 'otro', user_id: 'otro' },
      { id: 'a3', assigned_to: 'yo', user_id: null },
    ],
    properties: [
      { id: 'p1', assigned_to: 'yo' },
      { id: 'p2', assigned_to: 'otro' },
    ],
    scheduled: [
      { id: 's1', assigned_to: 'yo' },
      { id: 's2', assigned_to: 'otro' },
    ],
  }
  it('deja solo lo que está a nombre de quien mira', () => {
    const r = soloLoPropio(datos, 'yo')
    expect(r.contact).toEqual({ id: 'c1' })
    expect(r.deals.map((x) => x.id)).toEqual(['d1'])
    expect(r.appraisals.map((x) => x.id)).toEqual(['a1', 'a3'])
    expect(r.properties.map((x) => x.id)).toEqual(['p1'])
    expect(r.scheduled.map((x) => x.id)).toEqual(['s1'])
  })
  it('con id vacío no deja nada (un proceso sin asesor no es de nadie)', () => {
    const r = soloLoPropio(datos, '')
    expect([r.deals, r.appraisals, r.properties, r.scheduled].every((l) => l.length === 0)).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { alcanceContactos, puedeVerContacto, puedeReasignarContacto, type VinculosContacto } from './contact-access'

const sinVinculos: VinculosContacto = {
  assigned_to: null,
  created_by: null,
  asesoresDeProcesos: [],
  asesoresDeTasaciones: [],
}

describe('alcanceContactos', () => {
  it.each([
    ['admin', 'todos'],
    ['dueno', 'todos'],
    ['coordinador', 'todos'],
    ['asesor', 'propios'],
    ['abogado', 'ninguno'],
    ['agent', 'ninguno'],
    ['viewer', 'ninguno'],
    ['supervisor', 'ninguno'],
    ['', 'ninguno'],
  ])('%s → %s', (rol, alcance) => {
    expect(alcanceContactos(rol)).toBe(alcance)
  })
})

describe('puedeReasignarContacto', () => {
  it.each([
    ['admin', true],
    ['dueno', true],
    ['coordinador', true],
    ['asesor', false],
    ['abogado', false],
    ['agent', false],
    ['viewer', false],
    ['inventado', false],
  ])('%s → %s', (rol, puede) => {
    expect(puedeReasignarContacto(rol)).toBe(puede)
  })
})

describe('puedeVerContacto', () => {
  const asesor = { id: 'ase-1', role: 'asesor' }

  it.each(['admin', 'dueno', 'coordinador'])('%s ve cualquier contacto, aunque no tenga dueño', (role) => {
    expect(puedeVerContacto({ id: 'x', role }, sinVinculos)).toBe(true)
  })
  it.each(['abogado', 'agent', 'viewer', 'inventado'])('%s no ve nada, aunque el contacto esté a su nombre', (role) => {
    expect(
      puedeVerContacto({ id: 'yo', role }, { ...sinVinculos, assigned_to: 'yo', created_by: 'yo', asesoresDeProcesos: ['yo'] }),
    ).toBe(false)
  })
  it('el asesor no ve un contacto sin dueño ni vínculos', () => {
    expect(puedeVerContacto(asesor, sinVinculos)).toBe(false)
  })
  it('el asesor ve un contacto asignado a él', () => {
    expect(puedeVerContacto(asesor, { ...sinVinculos, assigned_to: 'ase-1' })).toBe(true)
  })
  it('el asesor ve un contacto que creó él', () => {
    expect(puedeVerContacto(asesor, { ...sinVinculos, created_by: 'ase-1' })).toBe(true)
  })
  it('el asesor ve un contacto sin dueño con un proceso asignado a él', () => {
    expect(puedeVerContacto(asesor, { ...sinVinculos, asesoresDeProcesos: [null, 'ase-1'] })).toBe(true)
  })
  it('el asesor ve un contacto con una tasación suya', () => {
    expect(puedeVerContacto(asesor, { ...sinVinculos, asesoresDeTasaciones: ['ase-1'] })).toBe(true)
  })
  it('el asesor no ve un contacto con un proceso de otro asesor', () => {
    expect(puedeVerContacto(asesor, { ...sinVinculos, assigned_to: 'otro', asesoresDeProcesos: ['otro'] })).toBe(false)
  })
  it('asesor coordina una tasación con el teléfono de una persona ya cargada: con ese proceso, el contacto se le abre (tarea 5.6)', () => {
    expect(
      puedeVerContacto(asesor, { assigned_to: 'otro', created_by: 'otro', asesoresDeProcesos: ['otro', 'ase-1'], asesoresDeTasaciones: [] }),
    ).toBe(true)
  })
  it('un proceso sin asesor no le da acceso a un asesor sin id', () => {
    expect(puedeVerContacto({ id: '', role: 'asesor' }, { ...sinVinculos, asesoresDeProcesos: [null] })).toBe(false)
  })
})

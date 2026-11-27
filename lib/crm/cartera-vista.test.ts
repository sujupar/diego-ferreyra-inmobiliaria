import { describe, it, expect } from 'vitest'
import { etiquetaMiVista, opcionesVerComo, procesoEnVista, vistaPara, type Vista } from './cartera-vista'
import type { EtapaCRM } from './etapas'

const PERFILES = [
  { id: 'coord-1', role: 'coordinador', is_active: true },
  { id: 'asesor-1', role: 'asesor', is_active: true },
  { id: 'asesor-baja', role: 'asesor', is_active: false },
  { id: 'asesor-null', role: 'asesor', is_active: null },
  { id: 'abogado-1', role: 'abogado', is_active: true },
  { id: 'admin-1', role: 'admin', is_active: true },
  { id: 'dueno-1', role: 'dueno', is_active: true },
]

describe('vistaPara — la vista propia de cada rol', () => {
  it('coordinador → vista de la coordinación con su id', () => {
    expect(vistaPara({ id: 'coord-1', role: 'coordinador' }, null, PERFILES)).toEqual({
      ok: true,
      vista: { tipo: 'coordinacion', personaId: 'coord-1' },
      mirando: null,
    })
  })
  it('asesor → vista del asesor con su id', () => {
    expect(vistaPara({ id: 'asesor-1', role: 'asesor' }, null, PERFILES)).toEqual({
      ok: true,
      vista: { tipo: 'asesor', personaId: 'asesor-1' },
      mirando: null,
    })
  })
  it('admin → vista del dueño', () => {
    expect(vistaPara({ id: 'admin-1', role: 'admin' }, null, PERFILES)).toEqual({ ok: true, vista: { tipo: 'dueno' }, mirando: null })
  })
  it('dueño → vista del dueño', () => {
    expect(vistaPara({ id: 'dueno-1', role: 'dueno' }, null, PERFILES)).toEqual({ ok: true, vista: { tipo: 'dueno' }, mirando: null })
  })
  it.each(['abogado', 'agent', 'viewer', 'inventado', ''])('rol %s → sin_vista', (role) => {
    expect(vistaPara({ id: 'x', role }, null, PERFILES)).toEqual({ ok: false, motivo: 'sin_vista' })
  })
  it('un rol sin vista con ver_como sigue siendo sin_vista (no se le dice nada de la otra persona)', () => {
    expect(vistaPara({ id: 'abogado-1', role: 'abogado' }, 'asesor-1', PERFILES)).toEqual({ ok: false, motivo: 'sin_vista' })
  })
  it('un ver_como vacío cuenta como no pedido', () => {
    expect(vistaPara({ id: 'asesor-1', role: 'asesor' }, '', PERFILES)).toEqual({
      ok: true,
      vista: { tipo: 'asesor', personaId: 'asesor-1' },
      mirando: null,
    })
  })
})

describe('vistaPara — "Ver como"', () => {
  it('dueño mira a un asesor → vista del asesor con el id de esa persona', () => {
    expect(vistaPara({ id: 'dueno-1', role: 'dueno' }, 'asesor-1', PERFILES)).toEqual({
      ok: true,
      vista: { tipo: 'asesor', personaId: 'asesor-1' },
      mirando: { id: 'asesor-1', role: 'asesor' },
    })
  })
  it('admin mira a la coordinación → vista de la coordinación de esa persona', () => {
    expect(vistaPara({ id: 'admin-1', role: 'admin' }, 'coord-1', PERFILES)).toEqual({
      ok: true,
      vista: { tipo: 'coordinacion', personaId: 'coord-1' },
      mirando: { id: 'coord-1', role: 'coordinador' },
    })
  })
  it('un asesor que pide ver como otro → ver_como_prohibido', () => {
    expect(vistaPara({ id: 'asesor-1', role: 'asesor' }, 'coord-1', PERFILES)).toEqual({ ok: false, motivo: 'ver_como_prohibido' })
  })
  it('un coordinador que pide ver como otro → ver_como_prohibido', () => {
    expect(vistaPara({ id: 'coord-1', role: 'coordinador' }, 'asesor-1', PERFILES)).toEqual({ ok: false, motivo: 'ver_como_prohibido' })
  })
  it('un asesor que se pide a sí mismo también es prohibido (la puerta es el rol)', () => {
    expect(vistaPara({ id: 'asesor-1', role: 'asesor' }, 'asesor-1', PERFILES)).toEqual({ ok: false, motivo: 'ver_como_prohibido' })
  })
  it('a un abogado → persona_invalida', () => {
    expect(vistaPara({ id: 'dueno-1', role: 'dueno' }, 'abogado-1', PERFILES)).toEqual({ ok: false, motivo: 'persona_invalida' })
  })
  it('a un perfil inactivo → persona_invalida', () => {
    expect(vistaPara({ id: 'dueno-1', role: 'dueno' }, 'asesor-baja', PERFILES)).toEqual({ ok: false, motivo: 'persona_invalida' })
  })
  it('a un perfil con is_active nulo → persona_invalida (falla cerrado)', () => {
    expect(vistaPara({ id: 'dueno-1', role: 'dueno' }, 'asesor-null', PERFILES)).toEqual({ ok: false, motivo: 'persona_invalida' })
  })
  it('a un id inexistente → persona_invalida', () => {
    expect(vistaPara({ id: 'dueno-1', role: 'dueno' }, 'no-existe', PERFILES)).toEqual({ ok: false, motivo: 'persona_invalida' })
  })
  it('el admin a sí mismo → persona_invalida', () => {
    expect(vistaPara({ id: 'admin-1', role: 'admin' }, 'admin-1', PERFILES)).toEqual({ ok: false, motivo: 'persona_invalida' })
  })
  it('a otro dueño o admin → persona_invalida (no tienen una vista para revisar)', () => {
    expect(vistaPara({ id: 'admin-1', role: 'admin' }, 'dueno-1', PERFILES)).toEqual({ ok: false, motivo: 'persona_invalida' })
  })
})

const COORD: Vista = { tipo: 'coordinacion', personaId: 'coord-1' }
const ASESOR: Vista = { tipo: 'asesor', personaId: 'asesor-1' }
const DUENO: Vista = { tipo: 'dueno' }
const p = (etapa: EtapaCRM, assigned_to: string | null = null, origin: string | null = null) => ({ etapa, origin, assigned_to })

describe('procesoEnVista — coordinación', () => {
  it.each<EtapaCRM>(['solicitud', 'coordinada', 'no_realizada'])('%s abierta → sí', (etapa) => {
    expect(procesoEnVista(p(etapa), COORD)).toBe(true)
  })
  it('una coordinada con asesor asignado → sí (sigue siendo de la coordinación)', () => {
    expect(procesoEnVista(p('coordinada', 'asesor-1'), COORD)).toBe(true)
  })
  it('descartado sin asesor → sí', () => {
    expect(procesoEnVista(p('descartado'), COORD)).toBe(true)
  })
  it('descartado con asesor → no', () => {
    expect(procesoEnVista(p('descartado', 'asesor-1'), COORD)).toBe(false)
  })
  it('captada → no', () => {
    expect(procesoEnVista(p('captada'), COORD)).toBe(false)
  })
  it('Realizada con asesor → no', () => {
    expect(procesoEnVista(p('realizada', 'asesor-1'), COORD)).toBe(false)
  })
  it.each<EtapaCRM>(['realizada', 'entregada', 'seguimiento', 'comprador'])('%s sin asesor → no', (etapa) => {
    expect(procesoEnVista(p(etapa), COORD)).toBe(false)
  })
  it('Clase gratuita por etapa → no', () => {
    expect(procesoEnVista(p('clase_gratuita'), COORD)).toBe(false)
  })
  it('una solicitud cuyo origen es la clase gratuita → no', () => {
    expect(procesoEnVista(p('solicitud', null, 'clase_gratuita'), COORD)).toBe(false)
  })
  it('un descartado sin asesor que vino de la clase gratuita → no', () => {
    expect(procesoEnVista(p('descartado', null, 'clase_gratuita'), COORD)).toBe(false)
  })
  it('una solicitud del embudo → sí', () => {
    expect(procesoEnVista(p('solicitud', null, 'embudo'), COORD)).toBe(true)
  })
})

describe('procesoEnVista — asesor', () => {
  it('un proceso propio en cualquier etapa → sí', () => {
    for (const etapa of ['solicitud', 'seguimiento', 'comprador', 'clase_gratuita', 'captada', 'descartado'] as EtapaCRM[]) {
      expect(procesoEnVista(p(etapa, 'asesor-1'), ASESOR)).toBe(true)
    }
  })
  it('un proceso de otro asesor → no', () => {
    expect(procesoEnVista(p('seguimiento', 'asesor-2'), ASESOR)).toBe(false)
  })
  it('un proceso sin asesor → no', () => {
    expect(procesoEnVista(p('solicitud'), ASESOR)).toBe(false)
  })
})

describe('procesoEnVista — dueño', () => {
  it('ve todo, también clases gratuitas, sin asesor y cerrados', () => {
    expect(procesoEnVista(p('clase_gratuita', null, 'clase_gratuita'), DUENO)).toBe(true)
    expect(procesoEnVista(p('seguimiento'), DUENO)).toBe(true)
    expect(procesoEnVista(p('captada', 'asesor-2'), DUENO)).toBe(true)
    expect(procesoEnVista(p('descartado', 'asesor-1'), DUENO)).toBe(true)
  })
})

describe('opcionesVerComo — las personas del selector (6.3)', () => {
  it('coordinadores y asesores ACTIVOS, por nombre, con "· coordinación" o "· asesor"', () => {
    const perfiles = new Map([
      ['a1', { nombre: 'Tomás Agüero', role: 'asesor', activo: true }],
      ['c1', { nombre: 'Paula Pandolfo', role: 'coordinador', activo: true }],
      ['a2', { nombre: 'Ángela Baja', role: 'asesor', activo: false }],
      ['d1', { nombre: 'Diego', role: 'dueno', activo: true }],
      ['l1', { nombre: 'Abogada', role: 'abogado', activo: true }],
      ['f1', { nombre: 'Florencia Ledesma', role: 'asesor', activo: true }],
    ])
    expect(opcionesVerComo(perfiles)).toEqual([
      { id: 'f1', etiqueta: 'Florencia Ledesma · asesor' },
      { id: 'c1', etiqueta: 'Paula Pandolfo · coordinación' },
      { id: 'a1', etiqueta: 'Tomás Agüero · asesor' },
    ])
  })
  it('sin nadie, una lista vacía', () => {
    expect(opcionesVerComo(new Map())).toEqual([])
  })
})

describe('etiquetaMiVista', () => {
  it('"Mi vista (dueño)" o "Mi vista (admin)"', () => {
    expect(etiquetaMiVista('dueno')).toBe('Mi vista (dueño)')
    expect(etiquetaMiVista('admin')).toBe('Mi vista (admin)')
  })
})

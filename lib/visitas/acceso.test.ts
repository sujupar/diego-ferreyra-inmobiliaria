import { describe, it, expect } from 'vitest'
import {
  puedeGestionarVisitas, puedeVerTodasLasVisitas, puedeVerVisita, asesorParaLaVisita, accionesParaRol,
  puedeAgendarVisitaEnPropiedad,
} from './acceso'
import type { TipoAccion } from './transiciones'

const YO = '11111111-1111-4111-8111-111111111111'
const OTRO = '22222222-2222-4222-8222-222222222222'

describe('permisos de visitas', () => {
  it('gestionan admin, dueño, coordinador y asesor; el abogado no', () => {
    expect(['admin', 'dueno', 'coordinador', 'asesor'].every(r => puedeGestionarVisitas(r as never))).toBe(true)
    expect(puedeGestionarVisitas('abogado')).toBe(false)
  })
  it('un rol desconocido cae del lado seguro', () => {
    expect(puedeGestionarVisitas('inventado' as never)).toBe(false)
    expect(puedeVerTodasLasVisitas('inventado' as never)).toBe(false)
  })
  it('el asesor ve solo las suyas (asignadas o creadas por él)', () => {
    expect(puedeVerVisita('asesor', YO, { advisor_id: YO, created_by: OTRO })).toBe(true)
    expect(puedeVerVisita('asesor', YO, { advisor_id: OTRO, created_by: YO })).toBe(true)
    expect(puedeVerVisita('asesor', YO, { advisor_id: OTRO, created_by: OTRO })).toBe(false)
    expect(puedeVerVisita('coordinador', YO, { advisor_id: OTRO, created_by: OTRO })).toBe(true)
    expect(puedeVerVisita('abogado', YO, { advisor_id: YO, created_by: YO })).toBe(false)
  })
})

describe('asesorParaLaVisita', () => {
  it('un asesor queda SIEMPRE a su nombre, pida lo que pida', () => {
    expect(asesorParaLaVisita('asesor', YO, OTRO)).toEqual({ ok: true, asesorId: YO, esPropio: true })
    expect(asesorParaLaVisita('asesor', YO, null)).toEqual({ ok: true, asesorId: YO, esPropio: true })
  })
  it('quien ve todo tiene que elegir el asesor', () => {
    expect(asesorParaLaVisita('coordinador', YO, OTRO)).toEqual({ ok: true, asesorId: OTRO, esPropio: false })
    expect(asesorParaLaVisita('admin', YO, ' ')).toEqual({ ok: false, error: 'Elegí el asesor que va a mostrar la propiedad' })
  })
})

describe('puedeAgendarVisitaEnPropiedad', () => {
  const PROPIEDAD_APROBADA_DISPONIBLE = { assigned_to: YO, status: 'approved', commercial_status: 'disponible' }

  it('el asesor dueño de una propiedad aprobada y disponible puede agendar', () => {
    expect(puedeAgendarVisitaEnPropiedad('asesor', YO, PROPIEDAD_APROBADA_DISPONIBLE)).toBe(true)
  })
  it('el asesor NO puede agendar en una propiedad ajena (misma regla que el servidor)', () => {
    expect(puedeAgendarVisitaEnPropiedad('asesor', YO, { ...PROPIEDAD_APROBADA_DISPONIBLE, assigned_to: OTRO })).toBe(false)
  })
  it('quien ve todas las visitas puede agendar en una propiedad ajena', () => {
    expect(puedeAgendarVisitaEnPropiedad('coordinador', YO, { ...PROPIEDAD_APROBADA_DISPONIBLE, assigned_to: OTRO })).toBe(true)
  })
  it('el abogado no puede agendar aunque sea "su" propiedad', () => {
    expect(puedeAgendarVisitaEnPropiedad('abogado', YO, PROPIEDAD_APROBADA_DISPONIBLE)).toBe(false)
  })
  it('no se agenda sobre una propiedad que todavía no está aprobada', () => {
    expect(puedeAgendarVisitaEnPropiedad('asesor', YO, { ...PROPIEDAD_APROBADA_DISPONIBLE, status: 'pending_review' })).toBe(false)
  })
  it('no se agenda sobre una propiedad vendida, reservada SÍ', () => {
    expect(puedeAgendarVisitaEnPropiedad('asesor', YO, { ...PROPIEDAD_APROBADA_DISPONIBLE, commercial_status: 'vendida' })).toBe(false)
    expect(puedeAgendarVisitaEnPropiedad('asesor', YO, { ...PROPIEDAD_APROBADA_DISPONIBLE, commercial_status: 'reservada' })).toBe(true)
  })
  it('sin commercial_status (null) se trata como disponible', () => {
    expect(puedeAgendarVisitaEnPropiedad('asesor', YO, { ...PROPIEDAD_APROBADA_DISPONIBLE, commercial_status: null })).toBe(true)
  })
})

describe('accionesParaRol', () => {
  const todas: TipoAccion[] = ['confirmar', 'realizada', 'no_realizada', 'reprogramar', 'cancelar', 'cambiar_asesor']

  it('a quien no ve todas las visitas se le saca "cambiar_asesor"', () => {
    expect(accionesParaRol(todas, 'asesor')).toEqual(['confirmar', 'realizada', 'no_realizada', 'reprogramar', 'cancelar'])
  })
  it('quien ve todas las visitas conserva "cambiar_asesor"', () => {
    expect(accionesParaRol(todas, 'coordinador')).toEqual(todas)
  })
  it('sin "cambiar_asesor" en la lista, no cambia nada', () => {
    expect(accionesParaRol(['confirmar'], 'asesor')).toEqual(['confirmar'])
  })
})

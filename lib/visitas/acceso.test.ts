import { describe, it, expect } from 'vitest'
import {
  puedeGestionarVisitas, puedeVerTodasLasVisitas, puedeVerVisita, asesorParaLaVisita, accionesParaRol,
  puedeAgendarVisitaEnPropiedad, puedeAgendarDesdeElListado,
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

describe('puedeAgendarDesdeElListado (modal del listado: rol como texto y datos que pueden faltar)', () => {
  const COMPLETA = { assigned_to: YO, status: 'approved', commercial_status: 'disponible' }

  it('con todos los datos, misma regla que la ficha', () => {
    expect(puedeAgendarDesdeElListado('asesor', YO, COMPLETA)).toBe(true)
    expect(puedeAgendarDesdeElListado('asesor', YO, { ...COMPLETA, assigned_to: OTRO })).toBe(false)
    expect(puedeAgendarDesdeElListado('coordinador', YO, { ...COMPLETA, assigned_to: OTRO })).toBe(true)
    expect(puedeAgendarDesdeElListado('abogado', YO, COMPLETA)).toBe(false)
    expect(puedeAgendarDesdeElListado('asesor', YO, { ...COMPLETA, commercial_status: 'vendida' })).toBe(false)
    expect(puedeAgendarDesdeElListado('asesor', YO, { ...COMPLETA, commercial_status: null })).toBe(true)
  })
  it('un rol que no es del catálogo (o vacío, o sin sesión) no muestra el botón', () => {
    expect(puedeAgendarDesdeElListado('', YO, COMPLETA)).toBe(false)
    expect(puedeAgendarDesdeElListado('jefe', YO, COMPLETA)).toBe(false)
    expect(puedeAgendarDesdeElListado(null, YO, COMPLETA)).toBe(false)
    expect(puedeAgendarDesdeElListado('coordinador', null, COMPLETA)).toBe(false)
  })
  it('si falta un dato para decidir (la fila del listado no trae commercial_status), no se muestra', () => {
    expect(puedeAgendarDesdeElListado('asesor', YO, { assigned_to: YO, status: 'approved' })).toBe(false)
    expect(puedeAgendarDesdeElListado('coordinador', YO, { assigned_to: YO, commercial_status: 'disponible' })).toBe(false)
    expect(puedeAgendarDesdeElListado('asesor', YO, { status: 'approved', commercial_status: 'disponible' })).toBe(false)
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

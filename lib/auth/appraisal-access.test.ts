/**
 * D1 (crítico): el abogado podía BORRAR DEFINITIVAMENTE cualquiera de las
 * tasaciones del sistema. La causa era la forma de la condición —
 * `if (role !== 'asesor') return true` — que no enumera a nadie: deja pasar a
 * todo rol que no sea asesor, incluidos los que no tienen ni un permiso
 * `appraisal.*`.
 *
 * Estos casos fijan la lista explícita. El más importante es el del rol
 * DESCONOCIDO: es el que prueba que la pieza falla cerrado y que un rol nuevo
 * no hereda acceso de arrastre.
 *
 * 2026-08-10: llega el alcance `vinculadas` (el abogado ve la tasación de la
 * propiedad que revisa). El riesgo de ese cambio es que las capacidades estaban
 * escritas como `!== 'ninguna'`: así, el alcance nuevo se habría llevado de
 * arrastre el listado, la creación, la edición y el borrado — o sea, D1 otra
 * vez, por la misma forma de condición. Los casos de abajo lo clavan.
 */
import { describe, it, expect } from 'vitest'
import {
  alcanceTasaciones, proyeccionDeTasacion, puedeBorrarTasacion, puedeEditarTasacion,
  puedeVerTasaciones, COLUMNAS_TASACION_RESUMIDA,
} from './appraisal-access'
import { ROLE_PERMISSIONS } from './roles'
import type { Role } from '@/types/auth.types'

describe('alcanceTasaciones', () => {
  it('admin, dueño y coordinador alcanzan todas', () => {
    expect(alcanceTasaciones('admin')).toBe('todas')
    expect(alcanceTasaciones('dueno')).toBe('todas')
    expect(alcanceTasaciones('coordinador')).toBe('todas')
  })

  it('asesor (y el legacy agent) alcanzan solo las propias', () => {
    expect(alcanceTasaciones('asesor')).toBe('propias')
    expect(alcanceTasaciones('agent')).toBe('propias')
  })

  it('el abogado alcanza SOLO las vinculadas a una propiedad', () => {
    expect(alcanceTasaciones('abogado')).toBe('vinculadas')
  })

  it('viewer no alcanza ninguna', () => {
    expect(alcanceTasaciones('viewer')).toBe('ninguna')
  })

  it('falla cerrado: un rol desconocido, vacío, null o undefined no alcanza nada', () => {
    expect(alcanceTasaciones('rol_que_no_existe_todavia')).toBe('ninguna')
    expect(alcanceTasaciones('')).toBe('ninguna')
    expect(alcanceTasaciones(null)).toBe('ninguna')
    expect(alcanceTasaciones(undefined)).toBe('ninguna')
    expect(puedeBorrarTasacion(undefined)).toBe(false)
  })

  it('coherencia con roles.ts: el abogado sigue sin ningún permiso de tasación', () => {
    // La lectura acotada NO se apoya en un permiso `appraisal.*` nuevo, sino en
    // los dos de propiedades que el abogado ya tiene. Si alguien le agrega uno
    // de tasación en roles.ts, este caso avisa que hay que decidir a mano qué
    // significa, no heredarlo.
    const permisosAbogado = ROLE_PERMISSIONS['abogado' as Role]
    expect(permisosAbogado.some(p => p.startsWith('appraisal.'))).toBe(false)
    expect(permisosAbogado).toContain('properties.review')
  })

  it('todo rol con alcance `vinculadas` tiene properties.view_all', () => {
    // El vínculo se resuelve como "existe una propiedad que apunta a esta
    // tasación", SIN filtrar por pertenencia de la propiedad (ver
    // `tasacionVinculadaAPropiedad` en entity-access.ts). Eso es correcto solo
    // mientras el rol revise TODAS las propiedades. Si este caso se pone rojo,
    // el chequeo del vínculo quedó regalando de más.
    const conVinculo = (Object.keys(ROLE_PERMISSIONS) as Role[])
      .filter(r => alcanceTasaciones(r) === 'vinculadas')
    expect(conVinculo).toEqual(['abogado'])
    for (const rol of conVinculo) {
      expect(ROLE_PERMISSIONS[rol]).toContain('properties.view_all')
    }
  })
})

describe('el alcance `vinculadas` es SOLO lectura y SOLO puntual', () => {
  it('el abogado NO tiene listado (ni Historial ni ítem de menú)', () => {
    expect(puedeVerTasaciones('abogado')).toBe(false)
  })

  it('el abogado NO crea ni edita', () => {
    expect(puedeEditarTasacion('abogado')).toBe(false)
  })

  it('el abogado NO borra', () => {
    expect(puedeBorrarTasacion('abogado')).toBe(false)
  })

  it('las tres capacidades siguen enteras para quienes las tenían', () => {
    for (const rol of ['admin', 'dueno', 'coordinador', 'asesor', 'agent']) {
      expect(puedeVerTasaciones(rol)).toBe(true)
      expect(puedeEditarTasacion(rol)).toBe(true)
      expect(puedeBorrarTasacion(rol)).toBe(true)
    }
  })

  it('un rol sin alcance no tiene ninguna de las tres', () => {
    for (const rol of ['viewer', 'rol_que_no_existe_todavia', '', null, undefined]) {
      expect(puedeVerTasaciones(rol)).toBe(false)
      expect(puedeEditarTasacion(rol)).toBe(false)
      expect(puedeBorrarTasacion(rol)).toBe(false)
    }
  })
})

describe('proyeccionDeTasacion — el servidor manda menos, no la pantalla esconde', () => {
  it('`vinculadas` recibe la ficha resumida y NINGÚN comparable', () => {
    const p = proyeccionDeTasacion('vinculadas')
    expect(p.columnas).toBe(COLUMNAS_TASACION_RESUMIDA)
    expect(p.columnas).not.toBe('*')
    expect(p.comparables).toBe(false)
    // Y lo DICE: la pantalla de la tasación necesita saber que con esto no
    // puede armar el informe.
    expect(p.resumida).toBe(true)
  })

  it('la ficha resumida NO incluye datos del cliente ni la metodología', () => {
    // Lo que no está en el `select` no sale de la base. Cada uno de estos
    // campos es una decisión explícita de no dárselo al abogado.
    for (const columna of [
      'contact_id', 'notes', 'valuation_result', 'property_features',
      'report_edits', 'property_url', 'property_images', 'property_description',
      'user_id', 'assigned_to',
      // Lo que le queda al dueño después de la comisión es aritmética de la
      // operación, no valuación de la propiedad: misma familia que la comisión
      // que la ficha ya le esconde al abogado.
      'money_in_hand',
    ]) {
      expect(COLUMNAS_TASACION_RESUMIDA).not.toContain(columna)
    }
  })

  it('la ficha resumida SÍ incluye qué se tasó, cuándo y en cuánto', () => {
    for (const columna of [
      'property_title', 'property_location', 'publication_price', 'sale_value',
      'currency', 'comparable_count', 'created_at',
    ]) {
      expect(COLUMNAS_TASACION_RESUMIDA).toContain(columna)
    }
  })

  it('los alcances de siempre reciben todo, como antes', () => {
    for (const alcance of ['todas', 'propias'] as const) {
      expect(proyeccionDeTasacion(alcance)).toEqual({ columnas: '*', comparables: true, resumida: false })
    }
  })
})

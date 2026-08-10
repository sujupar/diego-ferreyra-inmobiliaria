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
 */
import { describe, it, expect } from 'vitest'
import { alcanceTasaciones, puedeVerTasaciones, puedeBorrarTasacion } from './appraisal-access'
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

  it('el abogado NO alcanza ninguna — es el defecto D1', () => {
    expect(alcanceTasaciones('abogado')).toBe('ninguna')
    expect(puedeVerTasaciones('abogado')).toBe(false)
    expect(puedeBorrarTasacion('abogado')).toBe(false)
  })

  it('viewer tampoco', () => {
    expect(alcanceTasaciones('viewer')).toBe('ninguna')
  })

  it('falla cerrado: un rol desconocido, vacío, null o undefined no alcanza nada', () => {
    expect(alcanceTasaciones('rol_que_no_existe_todavia')).toBe('ninguna')
    expect(alcanceTasaciones('')).toBe('ninguna')
    expect(alcanceTasaciones(null)).toBe('ninguna')
    expect(alcanceTasaciones(undefined)).toBe('ninguna')
    expect(puedeBorrarTasacion(undefined)).toBe(false)
  })

  it('coherencia con roles.ts: ningún rol SIN permisos de propiedades ni de tasación queda con alcance', () => {
    // No se puede exigir `appraisal.*` para tener alcance —el coordinador no
    // lo tiene y sí coordina tasaciones—, pero sí lo inverso: el abogado, cuyos
    // ÚNICOS dos permisos son de propiedades, no puede tener alcance. Si alguien
    // le agrega un permiso de tasación en roles.ts, este caso avisa que hay que
    // decidir a mano, no heredarlo.
    const permisosAbogado = ROLE_PERMISSIONS['abogado' as Role]
    expect(permisosAbogado.some(p => p.startsWith('appraisal.'))).toBe(false)
    expect(alcanceTasaciones('abogado')).toBe('ninguna')
  })
})

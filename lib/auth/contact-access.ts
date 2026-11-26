// Quién ve un contacto (design.md D2). Puro. Lista EXPLÍCITA de roles que falla cerrado:
// un rol nuevo, o los viejos `agent`/`viewer`, no ven nada (igual que appraisal-access).
// La lectura de la base la hace `canAccessContact` en `entity-access.ts`.
import type { UsuarioMinimo } from '@/lib/crm/tipos'

export type AlcanceContactos = 'todos' | 'propios' | 'ninguno'

const TODOS = ['admin', 'dueno', 'coordinador']

export function alcanceContactos(role: string): AlcanceContactos {
  if (TODOS.includes(role)) return 'todos'
  if (role === 'asesor') return 'propios'
  return 'ninguno'
}

export interface VinculosContacto {
  assigned_to: string | null
  created_by: string | null
  asesoresDeProcesos: (string | null)[] // deals.assigned_to de sus procesos
  asesoresDeTasaciones: (string | null)[] // appraisals.assigned_to y appraisals.user_id
}

/**
 * Para el asesor, el contacto es suyo si lo tiene asignado o lo creó, o si tiene un
 * proceso o una tasación de ese contacto a su nombre. Sin esa segunda parte se rompería
 * `ContactEditor` en `/pipeline/[id]` y `/appraisals/[id]` (cambia la decisión 8.8,
 * confirmado por el dueño el 2026-11-25).
 */
export function puedeVerContacto(u: UsuarioMinimo, c: VinculosContacto): boolean {
  const alcance = alcanceContactos(u.role)
  if (alcance === 'todos') return true
  if (alcance === 'ninguno' || !u.id) return false
  return (
    c.assigned_to === u.id ||
    c.created_by === u.id ||
    c.asesoresDeProcesos.includes(u.id) ||
    c.asesoresDeTasaciones.includes(u.id)
  )
}

/** Solo quien ve todos los contactos puede cambiarles el asesor. */
export function puedeReasignarContacto(role: string): boolean {
  return alcanceContactos(role) === 'todos'
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserWithProfile } from '@/types/auth.types'

// Base simulada por tabla: cada pedido resuelve con lo que diga `respuestas[tabla]`.
type Respuesta = { data: unknown; error: { message: string } | null }
let respuestas: Record<string, Respuesta>
const tablasPedidas: string[] = []

function armarPedido(tabla: string) {
  tablasPedidas.push(tabla)
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'limit']) builder[m] = () => builder
  builder.maybeSingle = () => Promise.resolve(respuestas[tabla] ?? { data: null, error: null })
  return builder
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => armarPedido(t) }),
}))

const { canAccessContact } = await import('./entity-access')

const usuario = (role: string, id = 'ase-1') => ({ id, profile: { role } }) as unknown as UserWithProfile
const ok = (data: unknown): Respuesta => ({ data, error: null })

beforeEach(() => {
  tablasPedidas.length = 0
  respuestas = {}
})

describe('canAccessContact', () => {
  it('operaciones pasa sin consultar la base', async () => {
    expect(await canAccessContact(usuario('coordinador'), 'c-1')).toBe(true)
    expect(tablasPedidas).toEqual([])
  })
  it.each(['abogado', 'agent', 'viewer', 'inventado'])('%s no pasa y no consulta la base', async (rol) => {
    expect(await canAccessContact(usuario(rol), 'c-1')).toBe(false)
    expect(tablasPedidas).toEqual([])
  })
  it('asesor con el contacto asignado: pasa con una sola lectura', async () => {
    respuestas.contacts = ok({ assigned_to: 'ase-1', created_by: null })
    expect(await canAccessContact(usuario('asesor'), 'c-1')).toBe(true)
    expect(tablasPedidas).toEqual(['contacts'])
  })
  it('asesor que creó el contacto: pasa', async () => {
    respuestas.contacts = ok({ assigned_to: null, created_by: 'ase-1' })
    expect(await canAccessContact(usuario('asesor'), 'c-1')).toBe(true)
  })
  it('asesor con un proceso suyo de ese contacto: pasa', async () => {
    respuestas.contacts = ok({ assigned_to: null, created_by: null })
    respuestas.deals = ok({ assigned_to: 'ase-1' })
    expect(await canAccessContact(usuario('asesor'), 'c-1')).toBe(true)
    expect(tablasPedidas).toEqual(['contacts', 'deals'])
  })
  it('asesor con una tasación suya de ese contacto: pasa', async () => {
    respuestas.contacts = ok({ assigned_to: 'otro', created_by: null })
    respuestas.deals = ok(null)
    respuestas.appraisals = ok({ assigned_to: null, user_id: 'ase-1' })
    expect(await canAccessContact(usuario('asesor'), 'c-1')).toBe(true)
    expect(tablasPedidas).toEqual(['contacts', 'deals', 'appraisals'])
  })
  it('asesor sin ningún vínculo: no pasa', async () => {
    respuestas.contacts = ok({ assigned_to: 'otro', created_by: 'otro' })
    respuestas.deals = ok(null)
    respuestas.appraisals = ok(null)
    expect(await canAccessContact(usuario('asesor'), 'c-1')).toBe(false)
  })
  it('contacto inexistente: no pasa', async () => {
    respuestas.contacts = ok(null)
    expect(await canAccessContact(usuario('asesor'), 'no-existe')).toBe(false)
    expect(tablasPedidas).toEqual(['contacts'])
  })
  it('falla cerrado si la lectura del contacto da error', async () => {
    respuestas.contacts = { data: null, error: { message: 'red' } }
    expect(await canAccessContact(usuario('asesor'), 'c-1')).toBe(false)
  })
  it('falla cerrado si la lectura de procesos da error', async () => {
    respuestas.contacts = ok({ assigned_to: null, created_by: null })
    respuestas.deals = { data: null, error: { message: 'red' } }
    expect(await canAccessContact(usuario('asesor'), 'c-1')).toBe(false)
  })
  it('falla cerrado si la lectura de tasaciones da error', async () => {
    respuestas.contacts = ok({ assigned_to: null, created_by: null })
    respuestas.deals = ok(null)
    respuestas.appraisals = { data: null, error: { message: 'red' } }
    expect(await canAccessContact(usuario('asesor'), 'c-1')).toBe(false)
  })
  it('sin id no consulta y no pasa', async () => {
    expect(await canAccessContact(usuario('asesor'), '')).toBe(false)
    expect(tablasPedidas).toEqual([])
  })
})

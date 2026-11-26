// `existeContacto` con un id que no es uuid (revisión 12.1): responde "no existe" sin
// consultar la base, en vez de dejar que Postgres tire 22P02 y la ruta lo vuelva un 500.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const consultas: string[] = []
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      consultas.push(tabla)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => ({ data: { id: 'x' }, error: null })
      return q
    },
  }),
}))

const { existeContacto } = await import('./actividades')

beforeEach(() => {
  consultas.length = 0
})

describe('existeContacto', () => {
  it('un id que no es uuid → falso, sin consultar la base', async () => {
    expect(await existeContacto('no-es-uuid')).toBe(false)
    expect(await existeContacto('')).toBe(false)
    expect(consultas).toEqual([])
  })
  it('un uuid → consulta la base', async () => {
    expect(await existeContacto('3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e')).toBe(true)
    expect(consultas).toEqual(['contacts'])
  })
})

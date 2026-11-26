import { describe, it, expect, vi, beforeEach } from 'vitest'
import { textoNotaDeVinculo } from '@/lib/crm/actividades'

const m = vi.hoisted(() => ({
  inserts: [] as { tabla: string; fila: Record<string, unknown> }[],
  error: null as null | { message: string },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => ({
      insert: (fila: Record<string, unknown>) => {
        m.inserts.push({ tabla, fila })
        return Promise.resolve({ error: m.error })
      },
    }),
  }),
}))

const { registrarNotaDeVinculo } = await import('./contactos')

beforeEach(() => {
  m.inserts.length = 0
  m.error = null
})

describe('registrarNotaDeVinculo', () => {
  it('inserta una nota automática con el texto de textoNotaDeVinculo, sin occurred_at ni client_token', async () => {
    await registrarNotaDeVinculo({ contactId: 'c-1', dealId: 'd-1', autorId: 'ase-1', direccion: 'Formosa 5176' })
    expect(m.inserts).toEqual([
      {
        tabla: 'contact_activities',
        fila: {
          contact_id: 'c-1',
          deal_id: 'd-1',
          created_by: 'ase-1',
          kind: 'note',
          automatic: true,
          body: textoNotaDeVinculo('Formosa 5176'),
        },
      },
    ])
    expect(m.inserts[0].fila).not.toHaveProperty('occurred_at')
    expect(m.inserts[0].fila).not.toHaveProperty('client_token')
  })
  it('sin dirección usa el texto sin dirección', async () => {
    await registrarNotaDeVinculo({ contactId: 'c-1', dealId: 'd-1', autorId: 'ase-1', direccion: null })
    expect(m.inserts[0].fila.body).toBe(textoNotaDeVinculo(null))
  })
  it('lanza si la base devuelve error (supabase-js no lanza solo)', async () => {
    m.error = { message: 'violates check constraint' }
    await expect(
      registrarNotaDeVinculo({ contactId: 'c-1', dealId: 'd-1', autorId: 'ase-1', direccion: 'x' }),
    ).rejects.toThrow('violates check constraint')
  })
})

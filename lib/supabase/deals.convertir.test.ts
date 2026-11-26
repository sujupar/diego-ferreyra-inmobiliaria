/**
 * `convertirSolicitud` (crm-ficha-y-llamadas, tarea 8.1; design.md D9 paso 4): convierte
 * una solicitud en tasación coordinada con un `update`, sin crear otro proceso. La ruta
 * calcula los campos; esta función solo arma el `update` con el filtro de etapa y dice
 * si cambió una fila. NO toca Mailchimp: la sincronización la llama la ruta después de
 * guardar el contacto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({
  update: null as Record<string, unknown> | null,
  eqs: [] as [string, unknown][],
  or: null as string | null,
  select: null as string | null,
  filas: [{ id: 'd-1' }] as { id: string }[],
  error: null as { message: string } | null,
  sync: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      expect(tabla).toBe('deals')
      const q = {
        update: (payload: Record<string, unknown>) => {
          c.update = payload
          return q
        },
        eq: (col: string, val: unknown) => {
          c.eqs.push([col, val])
          return q
        },
        or: (filtro: string) => {
          c.or = filtro
          return q
        },
        select: async (cols: string) => {
          c.select = cols
          return { data: c.error ? null : c.filas, error: c.error }
        },
      }
      return q
    },
  }),
}))
vi.mock('@/lib/integrations/mailchimp/sync-deal', () => ({ syncDealToMailchimp: c.sync }))

import { convertirSolicitud, syncMailchimpBestEffort } from './deals'

const campos = {
  scheduled_date: '2026-12-01',
  scheduled_time: '10:00',
  assigned_to: 'asesor-1',
  property_address: 'Av. Belgrano 1500',
  property_type: 'departamento' as const,
  property_type_other: null,
  neighborhood: 'Monserrat',
  rooms: 2,
  covered_area: null,
}

beforeEach(() => {
  c.update = null
  c.eqs = []
  c.or = null
  c.select = null
  c.filas = [{ id: 'd-1' }]
  c.error = null
  c.sync.mockReset()
})

describe('convertirSolicitud', () => {
  it('el filtro de etapa va EN el update (el mismo texto de applyCRMStageFilter) y cuenta con select id', async () => {
    await convertirSolicitud('d-1', campos)
    expect(c.eqs).toContainEqual(['id', 'd-1'])
    expect(c.or).toBe('stage.eq.request,and(stage.eq.scheduled,scheduled_date.is.null)')
    expect(c.select).toBe('id')
  })

  it('lleva stage scheduled, stage_changed_at y updated_at con la hora actual, y los campos de la ruta', async () => {
    const antes = Date.now()
    await convertirSolicitud('d-1', campos)
    expect(c.update).toMatchObject({ ...campos, stage: 'scheduled' })
    const cambio = Date.parse(String(c.update?.stage_changed_at))
    expect(cambio).toBeGreaterThanOrEqual(antes)
    expect(c.update?.updated_at).toBe(c.update?.stage_changed_at)
  })

  it('sin notes en la entrada, la columna no va (las notas no se pisan)', async () => {
    await convertirSolicitud('d-1', campos)
    expect(c.update).not.toHaveProperty('notes')
  })

  it('con notes, va ese texto tal cual (la ruta ya lo armó)', async () => {
    await convertirSolicitud('d-1', { ...campos, notes: 'Mensaje previo\n\nTexto nuevo' })
    expect(c.update?.notes).toBe('Mensaje previo\n\nTexto nuevo')
  })

  it('created_by va solo si se lo pasan', async () => {
    await convertirSolicitud('d-1', campos)
    expect(c.update).not.toHaveProperty('created_by')
    await convertirSolicitud('d-1', { ...campos, created_by: 'coord-1' })
    expect(c.update?.created_by).toBe('coord-1')
  })

  it('no toca contact_id ni origin aunque vengan en la entrada', async () => {
    const conDeMas = { ...campos, contact_id: 'otro', origin: 'embudo' } as unknown as typeof campos
    await convertirSolicitud('d-1', conDeMas)
    expect(c.update).not.toHaveProperty('contact_id')
    expect(c.update).not.toHaveProperty('origin')
  })

  it('devuelve verdadero si cambió una fila y falso si no (la carrera: el proceso ya cambió de etapa)', async () => {
    expect(await convertirSolicitud('d-1', campos)).toBe(true)
    c.filas = []
    expect(await convertirSolicitud('d-1', campos)).toBe(false)
  })

  it('un error de la base se lanza (supabase-js no lanza solo)', async () => {
    c.error = { message: 'se cortó' }
    await expect(convertirSolicitud('d-1', campos)).rejects.toThrow(/se cortó/)
  })

  it('no llama a Mailchimp', async () => {
    await convertirSolicitud('d-1', campos)
    expect(c.sync).not.toHaveBeenCalled()
  })
})

describe('syncMailchimpBestEffort (exportada para la ruta)', () => {
  it('llama a la sincronización con el id', async () => {
    await syncMailchimpBestEffort('d-1')
    expect(c.sync).toHaveBeenCalledWith('d-1')
  })
  it('si falla, no lanza', async () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {})
    c.sync.mockRejectedValueOnce(new Error('mailchimp caído'))
    await expect(syncMailchimpBestEffort('d-1')).resolves.toBeUndefined()
    w.mockRestore()
  })
})

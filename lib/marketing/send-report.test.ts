import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * D20 — la configuración de reportes NO puede confundir "no hay nada
 * configurado" con "no pude leer".
 *
 * Por qué importa tanto: el PUT de `/api/settings/report-recipients` REEMPLAZA
 * el arreglo de destinatarios entero (no hace merge). Mientras `getReportSettings`
 * devolvía `recipients: []` ante un error de lectura, la pantalla de Configuración
 * se veía idéntica a "nunca se configuró nada" → el admin escribía su email y
 * tocaba Guardar → los destinatarios reales (Diego, la coordinadora, el dueño)
 * quedaban BORRADOS y los reportes dejaban de llegarles sin ninguna señal.
 *
 * La regla que fija este archivo: error de lectura → TIRA. Cero filas → default
 * vacío. Son dos caminos distintos y tienen que seguir siéndolo.
 */

// Estado que controla qué devuelve el `.maybeSingle()` de Supabase.
let respuesta: { data: unknown; error: { message: string } | null }
let ultimoMetodo: string

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            ultimoMetodo = 'maybeSingle'
            return respuesta
          },
          // Si el código volviera a `.single()`, este camino marca la regresión:
          // `.single()` reporta "0 filas" COMO ERROR, que es justo la conflación
          // que causaba el borrado.
          single: async () => {
            ultimoMetodo = 'single'
            return respuesta
          },
        }),
      }),
    }),
    insert: async () => ({ error: null }),
  }),
}))

vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ data: null, error: null }) } } }))

beforeEach(() => {
  respuesta = { data: null, error: null }
  ultimoMetodo = ''
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-falsa'
})

describe('getReportSettings — leer mal no puede parecerse a "no hay nada"', () => {
  it('ante un error de lectura TIRA (no devuelve la lista vacía)', async () => {
    const { getReportSettings } = await import('./send-report')
    respuesta = { data: null, error: { message: 'timeout contra la base' } }

    await expect(getReportSettings()).rejects.toThrow(/No se pudo leer la configuración de reportes/)
  })

  it('el mensaje del error incluye el motivo real, para que la pantalla lo pueda mostrar', async () => {
    const { getReportSettings } = await import('./send-report')
    respuesta = { data: null, error: { message: 'timeout contra la base' } }

    await expect(getReportSettings()).rejects.toThrow(/timeout contra la base/)
  })

  it('cuando NO hay fila (0 filas, sin error) devuelve el default vacío', async () => {
    const { getReportSettings } = await import('./send-report')
    respuesta = { data: null, error: null }

    const settings = await getReportSettings()
    expect(settings.recipients).toEqual([])
    expect(settings.id).toBe('default')
    // `.maybeSingle()` es la pieza que hace posible la distinción: con
    // `.single()`, "0 filas" llegaría como error y este caso tiraría.
    expect(ultimoMetodo).toBe('maybeSingle')
  })

  it('cuando hay fila devuelve los destinatarios reales', async () => {
    const { getReportSettings } = await import('./send-report')
    respuesta = {
      data: {
        id: 'default',
        recipients: ['diego@inmodf.com.ar', 'coordinacion@inmodf.com.ar'],
        daily_enabled: true,
        weekly_enabled: false,
        monthly_enabled: true,
        updated_at: '2026-08-01T00:00:00Z',
      },
      error: null,
    }

    const settings = await getReportSettings()
    expect(settings.recipients).toEqual(['diego@inmodf.com.ar', 'coordinacion@inmodf.com.ar'])
    expect(settings.weekly_enabled).toBe(false)
  })
})

describe('sendReport — sigue sin tirar, pero dice el motivo VERDADERO', () => {
  it('si no se pudo leer la configuración, no miente con "No recipients configured"', async () => {
    process.env.RESEND_API_KEY = 'clave-falsa'
    const { sendReport } = await import('./send-report')
    respuesta = { data: null, error: { message: 'timeout contra la base' } }

    const resultado = await sendReport({
      type: 'daily',
      date_from: '2026-08-01',
      date_to: '2026-08-01',
      meta: { total_leads: 0, total_spend: 0, average_ctr: 0, average_cost_per_lead: 0 },
      pipelines: [],
    } as never)

    expect(resultado.success).toBe(false)
    expect(resultado.error).toMatch(/No se pudo leer la configuración de reportes/)
    expect(resultado.error).not.toMatch(/No recipients configured/)
  })
})

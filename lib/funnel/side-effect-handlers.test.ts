/**
 * Tests de los cinco avisos diferidos.
 *
 * La regla que verifican: acá NADIE se traga su propio error. En el código
 * viejo cada aviso lo hacía (`console.warn` y a otra cosa), así que un evento de
 * conversión que Meta rechazaba se perdía para siempre — en tráfico pago eso es
 * plata. Ahora tiran y el worker decide si reintenta.
 *
 * Y la otra: `skipped` ≠ `done`. Un envío sin sesión anónima o sin `event_id`
 * del Píxel no tiene nada que hacer, y la cola tiene que decirlo tal cual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const espias = vi.hoisted(() => ({
  tareas: [] as Array<Record<string, unknown>>,
  tasacion: [] as string[],
  clase: [] as string[],
  mailchimp: [] as string[],
  mailchimpPrendido: true,
  rpcs: [] as Array<{ nombre: string; args: Record<string, unknown> }>,
  errorRpc: null as { message: string } | null,
  capi: [] as Array<Record<string, unknown>>,
  respuestaCapi: { ok: true } as { ok: boolean; error?: string },
}))

vi.mock('@/lib/supabase/tasks', () => ({
  createTaskForRole: async (rol: string, input: Record<string, unknown>) => {
    espias.tareas.push({ rol, ...input })
  },
}))
vi.mock('@/lib/email/notifications/appraisal-request', () => ({
  notifyAppraisalRequest: async ({ dealId }: { dealId: string }) => { espias.tasacion.push(dealId) },
}))
vi.mock('@/lib/email/notifications/class-registration', () => ({
  notifyClassRegistration: async ({ dealId }: { dealId: string }) => { espias.clase.push(dealId) },
}))
vi.mock('@/lib/integrations/mailchimp/client', () => ({
  mailchimpSyncEnabled: () => espias.mailchimpPrendido,
}))
vi.mock('@/lib/integrations/mailchimp/sync-deal', () => ({
  syncDealToMailchimp: async (dealId: string) => { espias.mailchimp.push(dealId) },
}))
vi.mock('@/lib/marketing/meta-capi', () => ({
  sendCapiEvent: async (input: Record<string, unknown>) => {
    espias.capi.push(input)
    return espias.respuestaCapi
  },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      espias.rpcs.push({ nombre, args })
      return { data: null, error: espias.errorRpc }
    },
  }),
}))

import { ejecutarTrabajo } from './side-effect-handlers'

beforeEach(() => {
  espias.tareas = []
  espias.tasacion = []
  espias.clase = []
  espias.mailchimp = []
  espias.mailchimpPrendido = true
  espias.rpcs = []
  espias.errorRpc = null
  espias.capi = []
  espias.respuestaCapi = { ok: true }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
})

describe('tarea de coordinación', () => {
  it('la crea con el título que ya usaba el sistema', async () => {
    const r = await ejecutarTrabajo('coordinator_task', {
      funnel: 'tasacion', dealId: 'deal-1', contactId: 'contacto-1', nombre: 'Ana Pérez',
    })
    expect(r).toBe('done')
    expect(espias.tareas[0]).toMatchObject({
      rol: 'coordinador',
      type: 'update_contact',
      title: 'Solicitud de tasación: Ana Pérez',
      deal_id: 'deal-1',
      contact_id: 'contacto-1',
    })
  })
})

describe('email al equipo', () => {
  it('una SOLICITUD de tasación usa su propia pieza, no la de tasación agendada', async () => {
    await ejecutarTrabajo('notify', { funnel: 'tasacion', dealId: 'deal-1' })
    expect(espias.tasacion).toEqual(['deal-1'])
    expect(espias.clase).toEqual([])
  })

  it('la clase gratuita usa la suya', async () => {
    await ejecutarTrabajo('notify', { funnel: 'clase', dealId: 'deal-2' })
    expect(espias.clase).toEqual(['deal-2'])
    expect(espias.tasacion).toEqual([])
  })
})

describe('Mailchimp', () => {
  it('con el interruptor apagado no llama a nadie y queda skipped', async () => {
    espias.mailchimpPrendido = false
    const r = await ejecutarTrabajo('mailchimp', { dealId: 'deal-1' })
    expect(r).toBe('skipped')
    expect(espias.mailchimp).toEqual([])
  })

  it('encendido, sincroniza', async () => {
    const r = await ejecutarTrabajo('mailchimp', { dealId: 'deal-1' })
    expect(r).toBe('done')
    expect(espias.mailchimp).toEqual(['deal-1'])
  })
})

describe('sesión anónima', () => {
  it('sin anonId no hay nada que vincular', async () => {
    const r = await ejecutarTrabajo('anon_stitch', { anonId: null, contactId: 'contacto-1' })
    expect(r).toBe('skipped')
    expect(espias.rpcs).toEqual([])
  })

  it('con anonId llama a la RPC del stitching', async () => {
    const r = await ejecutarTrabajo('anon_stitch', { anonId: 'anon-1', contactId: 'contacto-1' })
    expect(r).toBe('done')
    expect(espias.rpcs[0]).toEqual({
      nombre: 'link_anon_to_contact',
      args: { p_anon_id: 'anon-1', p_contact_id: 'contacto-1' },
    })
  })

  it('si la RPC falla, TIRA (para que el worker reintente)', async () => {
    espias.errorRpc = { message: 'rpc caída' }
    await expect(
      ejecutarTrabajo('anon_stitch', { anonId: 'anon-1', contactId: 'contacto-1' }),
    ).rejects.toThrow('rpc caída')
  })
})

describe('evento de conversión a Meta', () => {
  const PAYLOAD = {
    funnel: 'tasacion',
    eventId: 'evt-1',
    eventSourceUrl: 'https://inmobiliariadiegoferreyra.com/tasacion-directa',
    eventTimeUnixSeconds: 1_770_000_000,
    contentName: 'Tasación Directa',
    nombre: 'Ana Pérez',
    email: 'ana@ejemplo.com',
    phone: '+5491133445566',
    propertyLocation: 'Palermo',
    contactId: 'contacto-1',
    fbp: 'fb.1.2.3',
    fbc: null,
    ip: '200.10.20.30',
    userAgent: 'Mozilla/5.0',
  }

  it('manda CompleteRegistration con la hora REAL de la conversión', async () => {
    const r = await ejecutarTrabajo('capi', PAYLOAD)
    expect(r).toBe('done')
    expect(espias.capi[0]).toMatchObject({
      eventName: 'CompleteRegistration',
      eventId: 'evt-1',
      eventTimeUnixSeconds: 1_770_000_000,
    })
  })

  it('parte el nombre y manda los datos de match que pide Meta', async () => {
    await ejecutarTrabajo('capi', PAYLOAD)
    expect(espias.capi[0].userData).toMatchObject({
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@ejemplo.com',
      city: 'Palermo',
      externalId: 'contacto-1',
      clientIpAddress: '200.10.20.30',
      clientUserAgent: 'Mozilla/5.0',
    })
  })

  it('la clase gratuita no manda ciudad (no hay propiedad)', async () => {
    await ejecutarTrabajo('capi', { ...PAYLOAD, funnel: 'clase' })
    expect((espias.capi[0].userData as Record<string, unknown>).city).toBeNull()
  })

  it('sin event_id del Píxel no hay evento que deduplicar', async () => {
    const r = await ejecutarTrabajo('capi', { ...PAYLOAD, eventId: null })
    expect(r).toBe('skipped')
    expect(espias.capi).toEqual([])
  })

  it('si Meta lo rechaza, TIRA: una conversión perdida empeora la optimización de los adsets', async () => {
    espias.respuestaCapi = { ok: false, error: 'Invalid access token' }
    await expect(ejecutarTrabajo('capi', PAYLOAD)).rejects.toThrow('Invalid access token')
  })
})

describe('payload roto', () => {
  it('un trabajo sin los datos mínimos tira en vez de fingir que hizo algo', async () => {
    await expect(ejecutarTrabajo('notify', { funnel: 'tasacion' })).rejects.toThrow('dealId')
  })
})

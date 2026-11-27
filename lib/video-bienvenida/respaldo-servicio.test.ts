import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const espias = vi.hoisted(() => ({
  mensaje: { template_name: 'tasacion_video_caso_v1', phone_e164: '5491155550000' } as Record<string, unknown> | null,
  errorLectura: null as { message: string } | null,
  respaldo: { contactId: 'contacto-1', nombre: 'Ana' } as { contactId: string; nombre: string | null } | null,
  tomados: [] as string[],
  envios: [] as Array<Record<string, unknown>>,
  respuestaEnvio: { ok: true, skipped: false } as { ok: boolean; skipped: boolean; error?: string },
  lanzarEnvio: false,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: espias.mensaje, error: espias.errorLectura }),
          }),
        }),
      }),
    }),
  }),
}))
vi.mock('./enlaces', () => ({
  tomarRespaldo: async (wamid: string) => {
    espias.tomados.push(wamid)
    return espias.respaldo
  },
}))
vi.mock('@/lib/integrations/whatsapp/core', () => ({
  sendWhatsappTemplate: async (input: Record<string, unknown>) => {
    if (espias.lanzarEnvio) throw new Error('red')
    espias.envios.push(input)
    return espias.respuestaEnvio
  },
}))

import { mandarRespaldoBienvenidaSiCorresponde } from './respaldo-servicio'

const FALLO = { waMessageId: 'wamid.1', estado: 'failed', codigoError: '131049' }

beforeEach(() => {
  espias.mensaje = { template_name: 'tasacion_video_caso_v1', phone_e164: '5491155550000' }
  espias.errorLectura = null
  espias.respaldo = { contactId: 'contacto-1', nombre: 'Ana' }
  espias.tomados = []
  espias.envios = []
  espias.respuestaEnvio = { ok: true, skipped: false }
  espias.lanzarEnvio = false
})

describe('respaldo tardío del video de bienvenida (webhook de estados)', () => {
  it('freno de marketing sobre el mensaje con video: sale tasacion_llamada_v1 al mismo teléfono', async () => {
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('mandado')
    expect(espias.tomados).toEqual(['wamid.1'])
    expect(espias.envios).toHaveLength(1)
    expect(espias.envios[0]).toMatchObject({
      to: '5491155550000', templateName: 'tasacion_llamada_v1', bodyParams: ['Ana'], timeoutMs: 8000,
    })
  })

  it('un aviso repetido no manda un segundo mensaje', async () => {
    espias.respaldo = null
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('ya_mandado')
    expect(espias.envios).toEqual([])
  })

  it('los estados que no son fallas no tocan la base', async () => {
    expect(await mandarRespaldoBienvenidaSiCorresponde({ ...FALLO, estado: 'delivered' })).toBe('no_corresponde')
    expect(espias.tomados).toEqual([])
  })

  it('un mensaje que no es del video de bienvenida no hace nada', async () => {
    espias.mensaje = { template_name: 'encuesta_visita_v4', phone_e164: '5491155550000' }
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('no_corresponde')
    expect(espias.tomados).toEqual([])
  })

  it('otro error (número inválido) no hace nada', async () => {
    expect(await mandarRespaldoBienvenidaSiCorresponde({ ...FALLO, codigoError: '131026' })).toBe('no_corresponde')
  })

  it('NUNCA lanza: si falla el envío, devuelve error y el webhook sigue', async () => {
    espias.lanzarEnvio = true
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('error')
  })

  it('sin nombre guardado, saluda sin nombre', async () => {
    espias.respaldo = { contactId: 'contacto-1', nombre: null }
    await mandarRespaldoBienvenidaSiCorresponde(FALLO)
    expect(espias.envios[0].bodyParams).toEqual(['qué tal']) // "Hola qué tal, ¡recibimos tu solicitud…"
  })
})

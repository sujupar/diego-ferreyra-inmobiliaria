import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const espias = vi.hoisted(() => ({
  mensaje: { template_name: 'tasacion_video_caso_v1', phone_e164: '5491155550000' } as Record<string, unknown> | null,
  errorLectura: null as { message: string } | null,
  respaldo: { contactId: 'contacto-1', nombre: 'Ana', encolado: false } as { contactId: string; nombre: string | null; encolado: boolean } | null | 'error',
  /** Respuestas en orden para tomas sucesivas (el reintento). */
  colaRespaldo: [] as Array<{ contactId: string; nombre: string | null; encolado: boolean } | null | 'error'>,
  existe: true as boolean | 'error',
  lecturas: 0,
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
            maybeSingle: async () => {
              espias.lecturas++
              return { data: espias.mensaje, error: espias.errorLectura }
            },
          }),
        }),
      }),
    }),
  }),
}))
vi.mock('./enlaces', () => ({
  tomarRespaldo: async (wamid: string, telefono: string) => {
    espias.tomados.push(`${wamid}|${telefono}`)
    return espias.colaRespaldo.length ? espias.colaRespaldo.shift()! : espias.respaldo
  },
  existeEnlaceDelMensaje: async () => espias.existe,
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
  espias.respaldo = { contactId: 'contacto-1', nombre: 'Ana', encolado: false }
  espias.lecturas = 0
  espias.colaRespaldo = []
  espias.existe = true
  espias.tomados = []
  espias.envios = []
  espias.respuestaEnvio = { ok: true, skipped: false }
  espias.lanzarEnvio = false
})

describe('respaldo tardío del video de bienvenida (webhook de estados)', () => {
  it('freno de marketing sobre el mensaje con video: sale tasacion_llamada_v1 al mismo teléfono', async () => {
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('mandado')
    expect(espias.tomados).toEqual(['wamid.1|5491155550000'])
    expect(espias.envios).toHaveLength(1)
    expect(espias.envios[0]).toMatchObject({
      to: '5491155550000', templateName: 'tasacion_llamada_v1', bodyParams: ['Ana'], timeoutMs: 8000,
    })
  })

  it('un aviso repetido no manda un segundo mensaje (el enlace existe y ya se tomó)', async () => {
    espias.respaldo = null
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('ya_mandado')
    expect(espias.envios).toEqual([])
  })

  it('un hipo de la base se reintenta una vez y el respaldo sale igual', async () => {
    espias.colaRespaldo = ['error', { contactId: 'contacto-1', nombre: 'Ana', encolado: true }]
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('encolado')
    expect(espias.tomados).toHaveLength(2)
  })

  it('si la base falla dos veces, devuelve error (no "ya mandado")', async () => {
    espias.respaldo = 'error'
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('error')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('sin enlace con ese mensaje (wamid todavía sin escribir), lo dice distinto y lo registra como error', async () => {
    espias.respaldo = null
    espias.existe = false
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('sin_enlace')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
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

  it('otro error (número inválido) no hace nada y ni siquiera lee la base', async () => {
    expect(await mandarRespaldoBienvenidaSiCorresponde({ ...FALLO, codigoError: '131026' })).toBe('no_corresponde')
    expect(espias.lecturas).toBe(0)
  })

  it('lo normal: la base reencoló el trabajo sin video y el webhook NO llama a Meta', async () => {
    espias.respaldo = { contactId: 'contacto-1', nombre: 'Ana', encolado: true }
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('encolado')
    expect(espias.envios).toEqual([])
  })

  it('NUNCA lanza: si falla el envío, devuelve error y el webhook sigue', async () => {
    espias.lanzarEnvio = true
    expect(await mandarRespaldoBienvenidaSiCorresponde(FALLO)).toBe('error')
  })

  it('sin nombre guardado, saluda sin nombre', async () => {
    espias.respaldo = { contactId: 'contacto-1', nombre: null, encolado: false }
    await mandarRespaldoBienvenidaSiCorresponde(FALLO)
    expect(espias.envios[0].bodyParams).toEqual(['qué tal']) // "Hola qué tal, ¡recibimos tu solicitud…"
  })
})

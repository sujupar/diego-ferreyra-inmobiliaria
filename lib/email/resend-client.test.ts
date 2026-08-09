import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Estos dos módulos pegan contra Supabase. Los reemplazamos para que los tests
// no toquen la base y para poder AFIRMAR qué se registró en cada caso: la mitad
// de lo que hay que sostener acá es que un vencimiento se loguee igual que
// cualquier otro fallo.
const logNotification = vi.fn(async () => {})
const alreadySentToRecipient = vi.fn(async () => false)
vi.mock('./log', () => ({
  logNotification: (...a: unknown[]) => logNotification(...(a as [])),
  alreadySentToRecipient: (...a: unknown[]) => alreadySentToRecipient(...(a as [])),
}))
vi.mock('./test-mode', () => ({
  applyTestMode: async (to: string | string[], subject: string) => ({
    to: Array.isArray(to) ? to : [to],
    subject,
    testModeOn: false,
    originalTo: Array.isArray(to) ? to : [to],
  }),
}))

import {
  enviarConTecho,
  techoParaEnvio,
  sendEmail,
  ErrorTiempoEnvio,
  PREFIJO_ERROR_TIEMPO,
  TECHO_ENVIO_MS,
  TECHO_ENVIO_CON_ADJUNTOS_MS,
} from './resend-client'

/** Cliente de Resend de mentira. NUNCA sale a la red. */
function clienteFalso(impl: (payload: unknown, opts?: { signal?: AbortSignal }) => Promise<unknown>) {
  return { send: vi.fn(impl) } as unknown as Pick<typeof import('resend').Resend.prototype.emails, 'send'>
}

const OK = { data: { id: 're_ok_1' }, error: null }

beforeEach(() => {
  logNotification.mockClear()
  alreadySentToRecipient.mockClear()
  alreadySentToRecipient.mockResolvedValue(false)
  vi.stubEnv('RESEND_API_KEY', 're_clave_de_prueba')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// techoParaEnvio — elección del techo
// ---------------------------------------------------------------------------

describe('techoParaEnvio', () => {
  it('sin adjuntos usa el techo normal', () => {
    expect(techoParaEnvio({})).toBe(TECHO_ENVIO_MS)
  })

  it('con adjuntos usa el techo largo: el PDF viaja en base64 y lo que manda es la subida', () => {
    expect(techoParaEnvio({ attachments: [{ filename: 'a.pdf', content: Buffer.from('x') }] }))
      .toBe(TECHO_ENVIO_CON_ADJUNTOS_MS)
  })

  it('un array de adjuntos VACÍO no cuenta como adjunto', () => {
    expect(techoParaEnvio({ attachments: [] })).toBe(TECHO_ENVIO_MS)
  })

  it('el llamador puede pedir su propio techo', () => {
    expect(techoParaEnvio({ timeoutMs: 1234 })).toBe(1234)
  })

  it('el techo del llamador gana incluso sobre el de adjuntos', () => {
    expect(techoParaEnvio({ timeoutMs: 500, attachments: [{ filename: 'a.pdf', content: Buffer.from('x') }] }))
      .toBe(500)
  })

  // Un 0 sería "sin techo" — exactamente el bug que estamos arreglando.
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'un techo inválido (%p) cae al default en vez de dejar el envío sin techo',
    (valor) => {
      expect(techoParaEnvio({ timeoutMs: valor as number })).toBe(TECHO_ENVIO_MS)
    },
  )
})

// ---------------------------------------------------------------------------
// enviarConTecho — el envío rápido no cambia; el colgado corta
// ---------------------------------------------------------------------------

describe('enviarConTecho', () => {
  it('un envío normal (rápido) devuelve el id y no se ve afectado por el techo', async () => {
    const emails = clienteFalso(async () => OK)
    await expect(enviarConTecho(emails, {} as never, 8_000)).resolves.toEqual({ id: 're_ok_1' })
  })

  it('le pasa un AbortSignal al SDK: así se corta la petición de verdad', async () => {
    const emails = clienteFalso(async () => OK)
    await enviarConTecho(emails, {} as never, 8_000)
    const opts = (emails.send as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as {
      signal?: AbortSignal
    }
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    expect(opts.signal!.aborted).toBe(false)
  })

  it('un error normal del SDK sigue propagándose con SU mensaje, no como vencimiento', async () => {
    const emails = clienteFalso(async () => ({ data: null, error: { message: 'dominio no verificado' } }))
    await expect(enviarConTecho(emails, {} as never, 8_000)).rejects.toThrow('dominio no verificado')
    await expect(enviarConTecho(emails, {} as never, 8_000)).rejects.not.toThrow(
      new RegExp(PREFIJO_ERROR_TIEMPO),
    )
  })

  // Reproduce el incidente: una llamada que nunca resuelve. Con temporizadores
  // falsos, si el techo no existiera este test quedaría COLGADO para siempre.
  it('un envío que excede el techo falla POR TIEMPO y no se cuelga', async () => {
    vi.useFakeTimers()
    const emails = clienteFalso(() => new Promise(() => {})) // jamás resuelve
    const promesa = enviarConTecho(emails, {} as never, 8_000)
    const afirmacion = expect(promesa).rejects.toBeInstanceOf(ErrorTiempoEnvio)
    await vi.advanceTimersByTimeAsync(8_000)
    await afirmacion
  })

  it('el error de vencimiento dice explícitamente que fue por tiempo, y cuánto', async () => {
    vi.useFakeTimers()
    const emails = clienteFalso(() => new Promise(() => {}))
    const promesa = enviarConTecho(emails, {} as never, 8_000).catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(8_000)
    const err = (await promesa) as ErrorTiempoEnvio
    expect(err.message).toContain(PREFIJO_ERROR_TIEMPO)
    expect(err.message).toContain('8000')
    expect(err.timeoutMs).toBe(8_000)
  })

  it('al vencer ABORTA la señal: cancela de verdad, no solo deja de esperar', async () => {
    vi.useFakeTimers()
    let senal: AbortSignal | undefined
    const emails = clienteFalso((_p, opts) => {
      senal = opts?.signal
      return new Promise(() => {})
    })
    const promesa = enviarConTecho(emails, {} as never, 8_000).catch(() => {})
    await vi.advanceTimersByTimeAsync(8_000)
    await promesa
    expect(senal?.aborted).toBe(true)
  })

  it('no vence antes de tiempo: a un milisegundo del techo todavía está esperando', async () => {
    vi.useFakeTimers()
    let resuelto = false
    const emails = clienteFalso(() => new Promise(() => {}))
    const promesa = enviarConTecho(emails, {} as never, 8_000).catch(() => {
      resuelto = true
    })
    await vi.advanceTimersByTimeAsync(7_999)
    expect(resuelto).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await promesa
    expect(resuelto).toBe(true)
  })

  // El SDK 6.9.4 se traga el AbortError y devuelve un error genérico que no
  // menciona el tiempo. Si ganara la carrera, el cuelgue quedaría registrado
  // como un fallo de red cualquiera.
  it('si el SDK devuelve su error genérico DESPUÉS del aborto, igual se atribuye al tiempo', async () => {
    vi.useFakeTimers()
    const emails = clienteFalso(
      (_p, opts) =>
        new Promise((resolver) => {
          opts?.signal?.addEventListener('abort', () =>
            resolver({
              data: null,
              error: { message: 'Unable to fetch data. The request could not be resolved.' },
            }),
          )
        }),
    )
    const promesa = enviarConTecho(emails, {} as never, 8_000).catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(8_000)
    const err = (await promesa) as Error
    expect(err.message).toContain(PREFIJO_ERROR_TIEMPO)
    expect(err.message).not.toContain('Unable to fetch data')
  })

  it('limpia el temporizador tras un envío rápido (no deja el proceso vivo)', async () => {
    vi.useFakeTimers()
    const emails = clienteFalso(async () => OK)
    await enviarConTecho(emails, {} as never, 8_000)
    expect(vi.getTimerCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// sendEmail — el vencimiento recorre el MISMO camino que cualquier otro fallo
// ---------------------------------------------------------------------------

/** Reemplaza el SDK de Resend por uno de mentira, reimportando el módulo. */
async function sendEmailConSdk(
  impl: (payload: unknown, opts?: { signal?: AbortSignal }) => Promise<unknown>,
) {
  vi.resetModules()
  const send = vi.fn(impl)
  vi.doMock('resend', () => ({ Resend: class { emails = { send } } }))
  vi.doMock('./log', () => ({
    logNotification: (...a: unknown[]) => logNotification(...(a as [])),
    alreadySentToRecipient: (...a: unknown[]) => alreadySentToRecipient(...(a as [])),
  }))
  vi.doMock('./test-mode', () => ({
    applyTestMode: async (to: string | string[], subject: string) => ({
      to: Array.isArray(to) ? to : [to],
      subject,
      testModeOn: false,
      originalTo: Array.isArray(to) ? to : [to],
    }),
  }))
  const mod = await import('./resend-client')
  return { sendEmail: mod.sendEmail, send }
}

const ENTRADA = {
  notificationType: 'appraisal_request',
  entityType: 'deal' as const,
  entityId: 'deal-1',
  to: 'destino@ejemplo.com',
  subject: 'Nueva solicitud de tasación',
  html: '<p>hola</p>',
}

describe('sendEmail con techo', () => {
  it('un envío normal sigue funcionando igual: sent=1, ok=true, log "sent"', async () => {
    const { sendEmail: enviar } = await sendEmailConSdk(async () => OK)
    const r = await enviar(ENTRADA)
    expect(r).toEqual({ ok: true, sent: 1, skipped: 0, failed: 0, errors: [] })
    expect(logNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', resendId: 're_ok_1' }),
    )
  })

  it('un envío colgado se registra como FALLIDO, con el motivo de tiempo, y no lanza', async () => {
    vi.useFakeTimers()
    const { sendEmail: enviar } = await sendEmailConSdk(() => new Promise(() => {}))
    const promesa = enviar(ENTRADA)
    await vi.advanceTimersByTimeAsync(TECHO_ENVIO_MS)
    const r = await promesa

    // Mismo camino que cualquier otro fallo: la función NO lanza.
    expect(r.ok).toBe(false)
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(0)
    expect(r.errors[0]).toContain(PREFIJO_ERROR_TIEMPO)

    // Y queda igual de visible en el log que un fallo normal.
    expect(logNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        notificationType: 'appraisal_request',
        entityId: 'deal-1',
        recipient: 'destino@ejemplo.com',
        errorMessage: expect.stringContaining(PREFIJO_ERROR_TIEMPO) as unknown as string,
      }),
    )
  })

  it('el destinatario colgado no arrastra a los demás: el otro se manda igual', async () => {
    vi.useFakeTimers()
    const { sendEmail: enviar } = await sendEmailConSdk(async (payload) => {
      if ((payload as { to: string }).to === 'colgado@ejemplo.com') return new Promise(() => {})
      return OK
    })
    const promesa = enviar({ ...ENTRADA, to: ['colgado@ejemplo.com', 'bueno@ejemplo.com'] })
    await vi.advanceTimersByTimeAsync(TECHO_ENVIO_MS)
    const r = await promesa
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(1)
    expect(r.ok).toBe(false)
  })

  it('el techo llega al SDK como AbortSignal en cada envío', async () => {
    const { sendEmail: enviar, send } = await sendEmailConSdk(async () => OK)
    await enviar(ENTRADA)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'destino@ejemplo.com' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown as AbortSignal }),
    )
  })

  it('un fallo NO temporal conserva su mensaje original (no se disfraza de vencimiento)', async () => {
    const { sendEmail: enviar } = await sendEmailConSdk(async () => ({
      data: null,
      error: { message: 'dominio no verificado' },
    }))
    const r = await enviar(ENTRADA)
    expect(r.errors[0]).toBe('dominio no verificado')
    expect(r.errors[0]).not.toContain(PREFIJO_ERROR_TIEMPO)
  })

  it('el techo del llamador se respeta de punta a punta', async () => {
    vi.useFakeTimers()
    const { sendEmail: enviar } = await sendEmailConSdk(() => new Promise(() => {}))
    const promesa = enviar({ ...ENTRADA, timeoutMs: 2_000 })
    await vi.advanceTimersByTimeAsync(2_000)
    const r = await promesa
    expect(r.failed).toBe(1)
    expect(r.errors[0]).toContain('2000')
  })

  it('los destinatarios ya notificados se siguen salteando sin gastar el techo', async () => {
    alreadySentToRecipient.mockResolvedValue(true)
    const { sendEmail: enviar, send } = await sendEmailConSdk(async () => OK)
    const r = await enviar(ENTRADA)
    expect(r).toEqual({ ok: true, sent: 0, skipped: 1, failed: 0, errors: [] })
    expect(send).not.toHaveBeenCalled()
  })

  it('sin RESEND_API_KEY el comportamiento previo no cambia', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { sendEmail: enviar, send } = await sendEmailConSdk(async () => OK)
    const r = await enviar(ENTRADA)
    expect(r.ok).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
})

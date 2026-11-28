import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendEmail = vi.fn()
vi.mock('@/lib/email/resend-client', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))

let corridas: { ultima: unknown; ultimaOk: unknown } = { ultima: null, ultimaOk: null }
let errorLectura: Error | null = null
vi.mock('@/lib/video-refs/corridas', () => ({
  leerCorridas: async () => {
    if (errorLectura) throw errorLectura
    return corridas
  },
}))

// Base falsa: tablas en memoria, solo lo que usa la ruta.
const db = {
  radarCount: 1,
  errorCount: null as { message: string } | null,
  config: new Map<string, unknown>(),
  notificadas: new Map<string, string>(),
}
function from(tabla: string) {
  return {
    select: (_c?: string, o?: { head?: boolean }) => {
      if (tabla === 'radar_corridas' && o?.head) return Promise.resolve({ count: db.errorCount ? null : db.radarCount, error: db.errorCount })
      return {
        eq: (_k: string, clave: string) => ({
          maybeSingle: async () => {
            if (tabla === 'cron_config') return { data: { value: 'secreto-db' } }
            return { data: db.config.has(clave) ? { valor: db.config.get(clave) } : null }
          },
        }),
      }
    },
    upsert: async (row: { clave: string; valor: unknown }) => { db.config.set(row.clave, row.valor); return { error: null } },
    update: (vals: { notificada_at: string }) => ({
      eq: async (_k: string, id: string) => { db.notificadas.set(id, vals.notificada_at); return { error: null } },
    }),
  }
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from }) }))

import { POST, GET } from './route'

const req = (secret: string | null = 'secreto-db') =>
  new Request('https://x/api/cron/radar-watchdog', { method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {} }) as never

const frenada = {
  id: 'c1', inicio: new Date(Date.now() - 3600_000).toISOString(), estado: 'frenada_por_instagram',
  cuentas_revisadas: 3, reels_mirados: 10, publicadas: 0, mensaje: 'Instagram pidió esperar', notificada_at: null as string | null,
}

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue({ ok: true })
  db.radarCount = 1
  db.errorCount = null
  errorLectura = null
  db.config.clear()
  db.notificadas.clear()
  corridas = { ultima: null, ultimaOk: null }
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k')
  vi.stubEnv('EMAIL_ALERTAS_RADAR', 'julian@example.com')
})

describe('radar-watchdog', () => {
  it('sin secreto da 403 y no manda nada', async () => {
    const res = await POST(req(null))
    expect(res.status).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('GET ?ping=1 responde ok', async () => {
    const res = await GET(new Request('https://x/api/cron/radar-watchdog?ping=1') as never)
    expect((await res.json()).route).toBe('radar-watchdog')
  })

  it('corrida frenada: dos llamadas seguidas mandan UN solo email', async () => {
    corridas = { ultima: frenada, ultimaOk: null }
    await POST(req())
    // la segunda ve la corrida ya marcada
    corridas = { ultima: { ...frenada, notificada_at: db.notificadas.get('c1') ?? null }, ultimaOk: null }
    await POST(req())
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const arg = sendEmail.mock.calls[0][0]
    expect(arg.to).toBe('julian@example.com')
    expect(arg.subject).toContain('Radar de referencias')
    expect(db.notificadas.has('c1')).toBe(true)
  })

  it('si el email falla, no marca el aviso (se reintenta en la próxima)', async () => {
    sendEmail.mockResolvedValue({ ok: false })
    corridas = { ultima: frenada, ultimaOk: null }
    await POST(req())
    expect(db.notificadas.size).toBe(0)
  })

  it('atrasado: avisa una vez y no repite antes de 24 h', async () => {
    const vieja = { ...frenada, id: 'c2', estado: 'ok', inicio: new Date(Date.now() - 50 * 3600_000).toISOString() }
    corridas = { ultima: vieja, ultimaOk: vieja }
    await POST(req())
    await POST(req())
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(db.config.has('ultimo_aviso_atraso')).toBe(true)
  })

  it('atrasado: vuelve a avisar pasadas 24 h', async () => {
    const vieja = { ...frenada, id: 'c2', estado: 'ok', inicio: new Date(Date.now() - 50 * 3600_000).toISOString() }
    corridas = { ultima: vieja, ultimaOk: vieja }
    db.config.set('ultimo_aviso_atraso', new Date(Date.now() - 25 * 3600_000).toISOString())
    await POST(req())
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('sin corridas y radar todavía no instalado (tabla vacía): no avisa', async () => {
    db.radarCount = 0
    await POST(req())
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('todo bien: no manda nada', async () => {
    const ok = { ...frenada, id: 'c3', estado: 'ok' }
    corridas = { ultima: ok, ultimaOk: ok }
    await POST(req())
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('el aviso ignora el modo prueba de los mails', async () => {
    corridas = { ultima: frenada, ultimaOk: null }
    await POST(req())
    expect(sendEmail.mock.calls[0][0].ignorarModoPrueba).toBe(true)
  })

  it('si no se pueden leer las corridas: 500, sin mail y sin marca', async () => {
    errorLectura = new Error('no se pudieron leer las corridas del radar: timeout')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(db.config.has('ultimo_aviso_atraso')).toBe(false)
  })

  it('si falla el conteo de corridas (¿no instalado?): 500, sin mail y sin marca', async () => {
    db.errorCount = { message: 'timeout' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(db.config.has('ultimo_aviso_atraso')).toBe(false)
  })
})

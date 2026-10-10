import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Revisión final, grupo N: "Tu visita está confirmada" ignoraba los dos fallos
 * posibles. supabase-js NO lanza ante un error de lectura (devuelve { error }) y
 * `sendEmail` NUNCA lanza (devuelve { ok, sent, failed, errors }; CLAUDE.md § "La
 * conversión del embudo NO espera a nadie"): sin mirarlos, un mail que no salió
 * no dejaba ningún rastro. Ahora cada fallo queda en console.error con el id de
 * la visita y sin datos personales (ni nombre ni email del cliente).
 */
const { estado } = vi.hoisted(() => ({
  estado: {
    lectura: { data: null as unknown, error: null as { message: string } | null },
    resultado: { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] as string[] },
    enviados: 0,
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: async () => estado.lectura,
      }
      return cadena
    },
  }),
}))
vi.mock('@/lib/email/resend-client', () => ({
  sendEmail: vi.fn(async () => { estado.enviados++; return estado.resultado }),
}))
vi.mock('@/lib/email/render', () => ({ renderEmail: vi.fn(async () => '<html></html>') }))

import { sendVisitScheduledToClient } from './visit-scheduled-client'

const VISITA = '66666666-6666-4666-8666-666666666666'
const FILA = {
  id: VISITA, client_name: 'Sofía Benítez', client_email: 'sofia@mail.com', scheduled_at: '2099-01-12T14:00:00Z',
  property: { address: 'Doblas 248', neighborhood: 'Caballito' }, advisor: { full_name: 'Lucas', email: 'l@x.com', phone: null },
}

function textoDe(llamadas: unknown[][]): string {
  return llamadas.map(args => args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n')
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  estado.lectura = { data: FILA, error: null }
  estado.resultado = { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] }
  estado.enviados = 0
})

describe('sendVisitScheduledToClient — los fallos dejan rastro', () => {
  it('si la lectura de la visita falla, lo registra con el id y no intenta mandar', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      estado.lectura = { data: null, error: { message: 'timeout de la base' } }
      await sendVisitScheduledToClient(VISITA)
      expect(estado.enviados).toBe(0)
      const texto = textoDe(errores.mock.calls)
      expect(texto).toContain(VISITA)
      expect(texto).toContain('timeout de la base')
    } finally { errores.mockRestore() }
  })
  it('si el envío falla (failed > 0), lo registra con el id y los errores, sin datos personales', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      estado.resultado = { ok: false, sent: 0, skipped: 0, failed: 1, errors: ['Resend 500'] }
      await sendVisitScheduledToClient(VISITA)
      const texto = textoDe(errores.mock.calls)
      expect(texto).toContain(VISITA)
      expect(texto).toContain('Resend 500')
      expect(texto).not.toContain('sofia@mail.com')
      expect(texto).not.toContain('Sofía')
    } finally { errores.mockRestore() }
  })
  it('ok:false sin fallos (falta RESEND_API_KEY) también se registra', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      estado.resultado = { ok: false, sent: 0, skipped: 0, failed: 0, errors: ['RESEND_API_KEY not set; skipping email send'] }
      await sendVisitScheduledToClient(VISITA)
      expect(textoDe(errores.mock.calls)).toContain(VISITA)
    } finally { errores.mockRestore() }
  })
  it('si sale bien, no registra ningún error', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await sendVisitScheduledToClient(VISITA)
      expect(estado.enviados).toBe(1)
      expect(errores).not.toHaveBeenCalled()
    } finally { errores.mockRestore() }
  })
})

/**
 * `GET /api/marketing/reports/history` era un `select('*')` anónimo sobre
 * `email_report_log`.
 *
 * Esa tabla guarda A QUIÉN se le mandó cada reporte (mails del equipo y de los
 * dueños), el asunto y el `error_message` crudo de las corridas fallidas —
 * justo el material que sirve para armar un phishing creíble. Se lee con el
 * cliente service-role, así que la RLS `email_report_log_admin_only` no lo
 * frenaba. Verificado en vivo antes del arreglo: `200` con 2.017 bytes sin una
 * sola cookie.
 *
 * Guard elegido: `settings.manage` (admin + dueño), NO `requireAuth` a secas.
 * La policy de esa tabla en Postgres usa `is_privileged_user()`, que es
 * exactamente admin+dueño: el guard de la app queda alineado con la base en
 * vez de ser más laxo. Por eso el tercer bloque de tests: con sesión de asesor
 * o de coordinador tampoco pasa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, capturado, RedirectDeNext } = vi.hoisted(() => {
  class RedirectDeNext extends Error {
    digest: string
    constructor(destino: string) {
      super('NEXT_REDIRECT')
      this.digest = `NEXT_REDIRECT;replace;${destino};307;`
    }
  }
  return {
    estado: { autenticado: true, role: 'admin' as string },
    capturado: { tablas: [] as string[] },
    RedirectDeNext,
  }
})

vi.mock('@/lib/auth/require-role', async () => {
  const { hasPermission } = await vi.importActual<typeof import('@/lib/auth/roles')>('@/lib/auth/roles')
  return {
    requireAuth: async () => {
      if (!estado.autenticado) throw new RedirectDeNext('/login')
      return { id: 'u1', profile: { id: 'u1', role: estado.role } }
    },
    // Réplica fiel del helper real: primero exige sesión (redirect a /login) y
    // después el permiso (redirect a /). Usa la tabla de permisos REAL.
    requirePermission: async (permiso: never) => {
      if (!estado.autenticado) throw new RedirectDeNext('/login')
      if (!hasPermission(estado.role as never, permiso)) throw new RedirectDeNext('/')
      return { id: 'u1', profile: { id: 'u1', role: estado.role } }
    },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      capturado.tablas.push(tabla)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.order = () => q
      q.limit = () => Promise.resolve({
        data: [{
          id: 1,
          report_type: 'daily',
          recipients: ['dueno@ejemplo.com', 'coordinacion@ejemplo.com'],
          status: 'sent',
          error_message: null,
          sent_at: '2026-08-01T09:00:00Z',
        }],
        error: null,
      })
      return q
    },
  }),
}))

import { GET } from './route'

function pedir(qs = '?limit=3') {
  return GET(new Request(`http://local/api/marketing/reports/history${qs}`))
}

beforeEach(() => {
  capturado.tablas = []
  estado.autenticado = true
  estado.role = 'admin'
})

describe('GET /api/marketing/reports/history — sin sesión', () => {
  beforeEach(() => { estado.autenticado = false })

  it('NO devuelve el historial: corta con el redirect a /login', async () => {
    await expect(pedir()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/login;307;' })
  })

  it('NO llega a consultar email_report_log', async () => {
    await pedir().catch(() => {})
    expect(capturado.tablas).toEqual([])
  })

  it('el guard corre ANTES del try — no queda tapado por el catch como un 500', async () => {
    const resultado = await pedir().then(
      (res) => ({ tipo: 'respuesta' as const, status: res.status }),
      (err) => ({ tipo: 'throw' as const, digest: (err as { digest?: string }).digest }),
    )
    expect(resultado.tipo).toBe('throw')
    expect(capturado.tablas).toEqual([])
  })
})

describe('GET /api/marketing/reports/history — con sesión pero SIN settings.manage', () => {
  beforeEach(() => { estado.autenticado = true })

  it.each(['coordinador', 'asesor', 'abogado', 'agent', 'viewer'])(
    'un %s tampoco pasa: redirect a / y cero consultas a la tabla',
    async (role) => {
      estado.role = role
      await expect(pedir()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/;307;' })
      expect(capturado.tablas).toEqual([])
    },
  )
})

describe('GET /api/marketing/reports/history — con settings.manage', () => {
  it.each(['admin', 'dueno'])('un %s lo sigue viendo igual que antes', async (role) => {
    estado.role = role
    const res = await pedir()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['data'])
    expect(body.data[0]).toMatchObject({
      report_type: 'daily',
      status: 'sent',
      recipients: ['dueno@ejemplo.com', 'coordinacion@ejemplo.com'],
    })
    expect(capturado.tablas).toEqual(['email_report_log'])
  })

  it('los roles con settings.manage son exactamente los que la RLS admin-only deja entrar', async () => {
    // `email_report_log_admin_only` usa `is_privileged_user()` = admin|dueno.
    const { ROLES, hasPermission } = await import('@/lib/auth/roles')
    const conPermiso = ROLES.filter(r => hasPermission(r, 'settings.manage'))
    expect(conPermiso.sort()).toEqual(['admin', 'dueno'])
  })
})

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { resolveCredentials } from '@/lib/portals/credentials'
import type { Database } from '@/types/database.types'

/**
 * Diagnóstico de conexión con Argenprop (API REST).
 * GET /api/marketing/diag-argenprop          → presencia de env vars + enabled
 * GET /api/marketing/diag-argenprop?login=1   → además intenta el login real
 *
 * NO devuelve valores de credenciales, solo booleanos de presencia.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const env = process.env
    const present = {
      ARGENPROP_API_BASE: Boolean(env.ARGENPROP_API_BASE),
      ARGENPROP_TOKEN_CRM: Boolean(env.ARGENPROP_TOKEN_CRM),
      ARGENPROP_USR: Boolean(env.ARGENPROP_USR),
      ARGENPROP_PSD: Boolean(env.ARGENPROP_PSD),
      ARGENPROP_ID_ANUNCIANTE: Boolean(env.ARGENPROP_ID_ANUNCIANTE),
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const creds = await resolveCredentials('argenprop', { env, supabase })

    const out: Record<string, unknown> = {
      enabled: creds.enabled,
      present,
      // los 4 requeridos para que enabled sea true:
      faltan: Object.entries({
        ARGENPROP_TOKEN_CRM: present.ARGENPROP_TOKEN_CRM,
        ARGENPROP_USR: present.ARGENPROP_USR,
        ARGENPROP_PSD: present.ARGENPROP_PSD,
        ARGENPROP_ID_ANUNCIANTE: present.ARGENPROP_ID_ANUNCIANTE,
      }).filter(([, ok]) => !ok).map(([k]) => k),
      idAnunciante: creds.ap?.idAnunciante ?? null,
      apiBase: creds.ap?.apiBase ?? null,
    }

    if (new URL(req.url).searchParams.get('login') === '1' && creds.ap) {
      try {
        const { login } = await import('@/lib/portals/argenprop/client')
        const token = await login(creds.ap)
        out.loginOk = Boolean(token)
      } catch (e) {
        out.loginOk = false
        out.loginError = e instanceof Error ? e.message : String(e)
      }
    }

    return NextResponse.json(out)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

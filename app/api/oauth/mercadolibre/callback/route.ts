import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

export async function GET(request: Request) {
  // Solo admin/dueño pueden completar el OAuth de portales
  await requireRole('admin', 'dueno')

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')
  if (!code) {
    return NextResponse.json({ error: 'no code' }, { status: 400 })
  }

  // CSRF: validar state contra cookie
  const cookieStore = await cookies()
  const stateCookie = cookieStore.get('ml_oauth_state')?.value
  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return NextResponse.json(
      { error: 'invalid or missing state (possible CSRF)' },
      { status: 403 },
    )
  }

  // PKCE: code_verifier guardado en cookie en /start, requerido por ML
  // para cuentas con identidad verificada.
  const codeVerifier = cookieStore.get('ml_oauth_verifier')?.value
  if (!codeVerifier) {
    return NextResponse.json(
      { error: 'missing code_verifier (PKCE) — iniciá el flow desde /api/oauth/mercadolibre/start' },
      { status: 400 },
    )
  }

  const appId = process.env.ML_APP_ID
  const secret = process.env.ML_SECRET_KEY
  if (!appId || !secret) {
    return NextResponse.json(
      { error: 'ML credentials not configured' },
      { status: 500 },
    )
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/oauth/mercadolibre/callback`

  const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: appId,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return NextResponse.json(
      { error: 'token exchange failed', detail: text },
      { status: 502 },
    )
  }

  const data = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
    user_id: number
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  await supabase.from('portal_credentials').upsert({
    portal: 'mercadolibre',
    enabled: true,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    metadata: { user_id: data.user_id },
  })

  const res = NextResponse.redirect(
    `${appUrl}/settings/portals?oauth=mercadolibre_ok`,
  )
  // Limpiar cookies del flow
  res.cookies.delete('ml_oauth_state')
  res.cookies.delete('ml_oauth_verifier')
  return res
}

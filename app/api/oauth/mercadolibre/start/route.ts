import { NextResponse } from 'next/server'
import { randomBytes, createHash } from 'node:crypto'
import { requireRole } from '@/lib/auth/require-role'

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function GET() {
  // Solo admin/dueño pueden iniciar el OAuth de portales
  await requireRole('admin', 'dueno')

  const appId = process.env.ML_APP_ID
  if (!appId) {
    return NextResponse.json(
      { error: 'ML_APP_ID not configured' },
      { status: 500 },
    )
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/oauth/mercadolibre/callback`

  // CSRF: state token random guardado en cookie httpOnly
  const state = crypto.randomUUID()

  // PKCE: MercadoLibre requiere code_verifier + code_challenge para cuentas
  // con identidad verificada. Generamos verifier (43-128 chars URL-safe) y
  // challenge = base64url(sha256(verifier)). El verifier se guarda en cookie
  // y se valida en el callback al hacer el token exchange.
  const codeVerifier = base64UrlEncode(randomBytes(48)) // 64 chars base64url
  const codeChallenge = base64UrlEncode(
    createHash('sha256').update(codeVerifier).digest(),
  )

  const url = new URL('https://auth.mercadolibre.com.ar/authorization')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  const res = NextResponse.redirect(url.toString())
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 10, // 10 min
    path: '/api/oauth/mercadolibre',
  }
  res.cookies.set('ml_oauth_state', state, cookieOpts)
  res.cookies.set('ml_oauth_verifier', codeVerifier, cookieOpts)
  return res
}

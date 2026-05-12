import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/require-role'

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

  // CSRF protection: state token random guardado en cookie httpOnly
  const state = crypto.randomUUID()

  const url = new URL('https://auth.mercadolibre.com.ar/authorization')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set('ml_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 min
    path: '/api/oauth/mercadolibre',
  })
  return res
}

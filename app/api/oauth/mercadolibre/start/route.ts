import { NextResponse } from 'next/server'

export async function GET() {
  const appId = process.env.ML_APP_ID
  if (!appId) {
    return NextResponse.json(
      { error: 'ML_APP_ID not configured' },
      { status: 500 },
    )
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/oauth/mercadolibre/callback`

  const url = new URL('https://auth.mercadolibre.com.ar/authorization')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  return NextResponse.redirect(url.toString())
}

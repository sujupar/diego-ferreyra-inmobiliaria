import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'no code' }, { status: 400 })
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

  return NextResponse.redirect(
    `${appUrl}/settings/portals?oauth=mercadolibre_ok`,
  )
}

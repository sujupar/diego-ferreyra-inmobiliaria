import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface TrackBody {
  slug?: string
  funnel_type?: string
  utm?: Partial<{ utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string; utm_term: string }>
  fbclid?: string
  gclid?: string
  referrer?: string
}

const ALLOWED_FUNNELS = new Set(['clase_gratuita', 'tasacion', 'otro'])

/**
 * POST /api/landing/track-visit
 *
 * Body JSON:
 *   { slug, funnel_type, utm: { utm_source, ... }, fbclid, gclid, referrer }
 *
 * Registra una visita server-side. La IP se hashea con SHA-256 + salt env
 * (IP_HASH_SALT) para mantener métricas sin almacenar la IP original.
 *
 * Es público (sin auth) — el endpoint solo INSERT. La RLS de la tabla permite
 * INSERT a anon (ver migración 20260518000005).
 */
export async function POST(req: NextRequest) {
  let body: TrackBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' && body.slug.length > 0 && body.slug.length <= 200 ? body.slug : null
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const funnelType = ALLOWED_FUNNELS.has(body.funnel_type ?? '') ? body.funnel_type : 'otro'

  // Hash IP con salt (mantener métricas sin guardar IP cruda).
  const ipRaw = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const salt = process.env.IP_HASH_SALT ?? 'inmodf-default-salt'
  const ipHash = crypto.createHash('sha256').update(ipRaw + salt).digest('hex').slice(0, 32)

  const utm = body.utm ?? {}
  const cap = (v: unknown, n: number) => typeof v === 'string' ? v.slice(0, n) : null

  try {
    const supabase = getAdmin()
    await supabase.from('landing_page_visits').insert({
      slug:          cap(slug, 200),
      funnel_type:   funnelType,
      utm_source:    cap(utm.utm_source, 200),
      utm_medium:    cap(utm.utm_medium, 200),
      utm_campaign:  cap(utm.utm_campaign, 200),
      utm_content:   cap(utm.utm_content, 200),
      utm_term:      cap(utm.utm_term, 200),
      fbclid:        cap(body.fbclid, 200),
      gclid:         cap(body.gclid, 200),
      referrer:      cap(body.referrer, 500),
      user_agent:    cap(req.headers.get('user-agent'), 500),
      ip_hash:       ipHash,
    } as never)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    console.error('[api/landing/track-visit]', msg)
    // No exponer el detalle del error al cliente público.
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

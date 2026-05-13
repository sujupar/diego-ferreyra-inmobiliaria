import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function svc() {
  return createSupabaseClient(SERVICE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

const answerSchema = z.object({
  liked: z.boolean(),
  most_liked: z.string().min(1).max(2000),
  least_liked: z.string().min(1).max(2000),
  in_price: z.boolean(),
  hypothetical_offer: z.number().nonnegative(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = svc()
  const { data } = await supabase
    .from('visit_questionnaire_tokens')
    .select(`
      token, expires_at, used_at,
      visit:property_visits(id, client_name, property:properties(address))
    `)
    .eq('token', token)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  if (data.used_at) return NextResponse.json({ error: 'already_used' }, { status: 410 })
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  const visit = Array.isArray(data.visit) ? data.visit[0] : data.visit
  const property = visit && (Array.isArray(visit.property) ? visit.property[0] : visit.property)

  return NextResponse.json({
    clientName: visit?.client_name,
    propertyAddress: property?.address,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const parsed = answerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = svc()
  const { data: t } = await supabase
    .from('visit_questionnaire_tokens')
    .select('visit_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!t) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  if (t.used_at) return NextResponse.json({ error: 'already_used' }, { status: 410 })
  if (new Date(t.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  const { error: insErr } = await supabase.from('visit_questionnaires').insert({
    visit_id: t.visit_id,
    response_source: 'client',
    liked: parsed.data.liked,
    most_liked: parsed.data.most_liked,
    least_liked: parsed.data.least_liked,
    in_price: parsed.data.in_price,
    hypothetical_offer: parsed.data.hypothetical_offer,
    responded_at: new Date().toISOString(),
  })
  if (insErr) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  await supabase.from('visit_questionnaire_tokens').update({ used_at: new Date().toISOString() }).eq('token', token)

  return NextResponse.json({ ok: true })
}

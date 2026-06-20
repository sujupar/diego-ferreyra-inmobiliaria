import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Resumen agregado por sesión. Idempotente: el servidor toma GREATEST y dedup de clics por seq.
const Schema = z.object({
  anonId: z.string().min(8).max(64),
  page: z.string().min(1).max(32),
  funnel: z.string().max(32).nullable().optional(),
  device: z.string().max(16).nullable().optional(),
  maxScrollPct: z.number().int().min(0).max(100),
  sections: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        reached: z.boolean(),
        ms: z.number().nonnegative().max(86_400_000),
      }),
    )
    .max(40),
  clicks: z
    .array(
      z.object({
        seq: z.number().int().min(0).max(10_000),
        section: z.string().max(40).nullable(),
        xPct: z.number().min(0).max(100),
        yPct: z.number().min(0).max(100),
        tag: z.string().max(16),
        rage: z.boolean(),
      }),
    )
    .max(120),
})

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const d = parsed.data

  // Anti-ruido: descartar pings sin interacción real.
  if (d.maxScrollPct <= 0 && d.clicks.length === 0 && !d.sections.some((s) => s.ms > 0 || s.reached)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    const supabase = admin()
    const { error } = await supabase.rpc('track_heatmap', {
      p_anon: d.anonId,
      p_page: d.page,
      p_device: d.device ?? null,
      p_funnel: d.funnel ?? null,
      p_max_scroll: d.maxScrollPct,
      p_sections: d.sections,
      p_clicks: d.clicks,
    })
    if (error) {
      console.warn('[track/heatmap] rpc', error.message)
      return NextResponse.json({ ok: false }, { status: 200 })
    }
  } catch (e) {
    console.warn('[track/heatmap] threw', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  return NextResponse.json({ ok: true })
}

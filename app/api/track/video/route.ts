import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Recibe el snapshot acumulado del tracker (cliente). El UPSERT toma el máximo,
// así que reenviar es idempotente. anon_id es el UUID propio (cookie df_anon).
const Schema = z.object({
  anonId: z.string().min(8).max(64),
  videoKey: z.string().min(1).max(64),
  context: z.string().max(32).nullable().optional(),
  funnel: z.string().max(32).nullable().optional(),
  pagePath: z.string().max(300).nullable().optional(),
  durationS: z.number().nonnegative().max(86_400).nullable().optional(),
  watchSeconds: z.number().nonnegative().max(86_400),
  maxPercent: z.number().int().min(0).max(100),
  quartiles: z.number().int().min(0).max(31),
  completed: z.boolean(),
  fbp: z.string().max(200).nullable().optional(),
  watchedBuckets: z.string().regex(/^[01]{100}$/).nullable().optional(), // bitmap de 100 tramos
  // Tasa de reproducción: intentos (clicks en play) vs playback efectivo. Detecta
  // bloqueos de autoplay del navegador (ver FunnelClickToPlayVideo).
  playIntents: z.number().int().min(0).max(500).optional(),
  playbackStarted: z.boolean().optional(),
})

// Cliente admin sin tipar (convención del repo: el tipo Database no incluye estas tablas).
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

  // Anti-bot mínimo: descartar pings sin visionado NI intento de reproducción
  // (prefetch / link-preview). Un intento sin playback SÍ se guarda: es la señal
  // que revela bloqueos de autoplay del navegador.
  if (d.watchSeconds <= 0 && !(d.playIntents && d.playIntents > 0)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    const supabase = admin()
    const baseArgs = {
      p_anon_id: d.anonId,
      p_video_key: d.videoKey,
      p_context: d.context ?? null,
      p_page_path: d.pagePath ?? null,
      p_duration: d.durationS ?? null,
      p_watch_seconds: d.watchSeconds,
      p_max_percent: d.maxPercent,
      p_quartiles: d.quartiles,
      p_completed: d.completed,
      p_funnel: d.funnel ?? null,
      p_fbp: d.fbp ?? null,
      p_watched_buckets: d.watchedBuckets ?? null,
    }
    let { error } = await supabase.rpc('upsert_video_view', {
      ...baseArgs,
      p_play_intents: d.playIntents ?? 0,
      p_playback_started: d.playbackStarted ?? false,
    })
    // Si la migración de play-rate todavía no corrió, la función no acepta los
    // params nuevos → reintentamos con la firma anterior para NO perder el evento.
    if (error) {
      const retry = await supabase.rpc('upsert_video_view', baseArgs)
      if (!retry.error) error = null
    }
    if (error) {
      console.warn('[track/video] rpc error', error.message)
      return NextResponse.json({ ok: false }, { status: 200 })
    }
  } catch (e) {
    console.warn('[track/video] threw', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  return NextResponse.json({ ok: true })
}

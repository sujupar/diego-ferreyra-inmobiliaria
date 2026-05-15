import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  fetchPipelines, fetchOpportunities, importOpportunity,
  TARGET_PIPELINE_NAME, type ImportResult,
} from '@/lib/ghl/import'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // segundos — el polling cada 10 min trae lotes chicos

/**
 * GET /api/cron/ghl-poll
 *
 * Cron del polling de GHL — corre cada 10 min vía Netlify Scheduled Function.
 *
 * Auth: header `x-cron-secret` debe matchear env var CRON_SECRET.
 *
 * Estrategia:
 *   1. Lee `last_polled_at` de la tabla ghl_poll_state (singleton id=1).
 *   2. Trae opps del pipeline target con updatedAt >= last_polled_at - 5min
 *      (overlap chico para tolerar clock skew y reordenamientos).
 *   3. Para cada opp llama `importOpportunity` (idempotente vía
 *      ghl_opportunity_id UNIQUE).
 *   4. Actualiza last_polled_at = now() + escribe stats de la corrida.
 *
 * Primera corrida: last_polled_at es null → setea a now() y NO importa nada.
 * El backfill histórico ya se hizo con scripts/ghl-import.ts.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const startedAt = new Date()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 1. Leer estado
  const { data: state } = await supabase
    .from('ghl_poll_state')
    .select('last_polled_at')
    .eq('id', 1)
    .maybeSingle()

  const lastPolledAt = state?.last_polled_at as string | null

  // Primera corrida: marca el punto de partida y sale.
  if (!lastPolledAt) {
    await supabase.from('ghl_poll_state').upsert({
      id: 1,
      last_polled_at: startedAt.toISOString(),
      last_run_started_at: startedAt.toISOString(),
      last_run_finished_at: new Date().toISOString(),
      last_run_stats: { kind: 'bootstrap', message: 'Primera corrida — punto de partida marcado, sin import.' },
      updated_at: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true, bootstrap: true, lastPolledAt: startedAt.toISOString() })
  }

  // Overlap de 5 min hacia atrás para tolerar clock skew.
  const cutoff = new Date(new Date(lastPolledAt).getTime() - 5 * 60 * 1000).toISOString()

  // 2. Fetch pipelines + opps nuevas
  let pipelineId: string | null = null
  let opps: Awaited<ReturnType<typeof fetchOpportunities>> = []
  const stageMap = new Map<string, string>()
  try {
    const pipelines = await fetchPipelines()
    const target = pipelines.find(p => p.name === TARGET_PIPELINE_NAME)
    if (!target) {
      return NextResponse.json({ error: 'target pipeline no encontrado' }, { status: 500 })
    }
    pipelineId = target.id
    for (const s of target.stages) stageMap.set(s.id, s.name)
    // En polling traemos pocos páginas — si hay >1000 cambios en 10 min algo
    // está raro, igualmente la dedup por ghl_opportunity_id evita duplicados.
    opps = await fetchOpportunities(target.id, { stopBeforeUpdatedAt: cutoff, maxPages: 10 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('ghl_poll_state').update({
      last_run_started_at: startedAt.toISOString(),
      last_run_finished_at: new Date().toISOString(),
      last_run_stats: { kind: 'fetch_error', message: msg },
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    return NextResponse.json({ error: 'GHL fetch failed', detail: msg }, { status: 502 })
  }

  // 3. Procesar
  const counters = {
    fetched: opps.length,
    created: 0,
    claimed: 0,
    skipped_existing: 0,
    skipped_call_stage: 0,
    errors: 0,
    errorDetails: [] as Array<{ oppId: string; name: string; message: string }>,
  }

  for (const opp of opps) {
    const stageName = stageMap.get(opp.pipelineStageId) || '(stage desconocido)'
    let result: ImportResult
    try {
      result = await importOpportunity(supabase, opp, stageName)
    } catch (err) {
      counters.errors++
      counters.errorDetails.push({ oppId: opp.id, name: opp.name, message: err instanceof Error ? err.message : String(err) })
      continue
    }
    switch (result.kind) {
      case 'created': counters.created++; break
      case 'claimed': counters.claimed++; break
      case 'skipped_existing': counters.skipped_existing++; break
      case 'skipped_call_stage': counters.skipped_call_stage++; break
      case 'error':
        counters.errors++
        counters.errorDetails.push({ oppId: opp.id, name: opp.name, message: result.message })
        break
    }
  }

  // 4. Persistir estado
  const finishedAt = new Date()
  await supabase.from('ghl_poll_state').update({
    last_polled_at: startedAt.toISOString(),
    last_run_started_at: startedAt.toISOString(),
    last_run_finished_at: finishedAt.toISOString(),
    last_run_stats: counters,
    updated_at: finishedAt.toISOString(),
  }).eq('id', 1)

  return NextResponse.json({
    ok: true,
    pipelineId,
    cutoff,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    ...counters,
  })
}

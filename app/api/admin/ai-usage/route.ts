import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { hasPermission } from '@/lib/auth/roles'
import {
  summarizeTotals,
  groupAnalysesByDay,
  summarizeAgentVisits,
  AI_TOKEN_PRICE_USD_PER_MILLION,
  type AiUsageStateRow,
  type AgentVisitsMode,
} from '@/lib/admin/ai-usage'
import { getUsdToArs } from '@/lib/marketing/usd-rate'

/**
 * GET /api/admin/ai-usage
 *
 * Panel de costo del agente de IA (task 5, `.superpowers/sdd/2026-08-03-agente-ia/`).
 * SOLO LECTURA — el interruptor del agente (`ai_agent_settings`) lo maneja
 * otra tarea, acá no se escribe nada.
 *
 * Gate: `settings.manage` (admin/dueño), mismo criterio que el resto de
 * "Admin" en el nav (`app/(dashboard)/layout.tsx`).
 *
 * `conversation_ai_state`/`ai_agent_settings`/`property_visits` no requieren
 * el genérico `<Database>` completo acá (la primera ni siquiera está en
 * `types/database.types.ts` — el CLI de Supabase no conecta, ver CLAUDE.md) —
 * cliente sin genérico + cast manual, mismo patrón que
 * `lib/integrations/whatsapp/log.ts` y `app/api/whatsapp/conversations/route.ts`.
 *
 * Respuesta:
 * ```
 * {
 *   totals: { conversationsAnalyzed, analysesCount, tokensUsedTotal, estimatedCostUsd, estimatedCostArs, agentMessagesSent, agentHandedOff }
 *   byDay: Array<{ date, conversationsCount, analysesCount, tokensUsedTotal, estimatedCostUsd, estimatedCostArs }>  // ver limitación en lib/admin/ai-usage.ts
 *   visits: { proposed, confirmed, mode }  // mode 'exacto' = property_visits.created_by_ai; 'estimado' = inferencia por teléfono (migración sin correr)
 *   pricePerMillionUsd: number
 *   usdToArs: { rate: number; source: string }
 * }
 * ```
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  try {
    const user = await requireAuth()
    if (!hasPermission(user.profile.role, 'settings.manage')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = admin()

    const [aiStateRes, visitsRes, usdRate] = await Promise.all([
      supabase
        .from('conversation_ai_state')
        .select('phone_e164, intent, analyses_count, tokens_used_total, agent_messages_sent, agent_handed_off, last_analyzed_at'),
      supabase.from('property_visits').select('client_phone, status, created_by_ai'),
      getUsdToArs(),
    ])

    if (aiStateRes.error) {
      // Tabla recién creada por migración manual — si todavía no corrió en
      // este entorno, degradar a "todo en cero" en vez de 500: el panel debe
      // seguir siendo útil ("acá no pasó nada todavía") en vez de romperse.
      console.warn('[ai-usage] no se pudo leer conversation_ai_state:', aiStateRes.error.message)
    }
    const aiStateRows = (aiStateRes.data ?? []) as AiUsageStateRow[]

    // `created_by_ai` es la marca EXACTA de "esta visita la agendó el agente"
    // (migración 20260803000003). Si todavía no corrió en este entorno, el
    // `select` de arriba falla entero — reintentamos sin la columna y el
    // conteo cae al modo 'estimado' (inferencia por teléfono), que el panel
    // muestra como tal en vez de mentir con un número exacto.
    let visitRows = (visitsRes.data ?? []) as Array<{
      client_phone: string | null
      status: string
      created_by_ai?: boolean | null
    }>
    let visitsMode: AgentVisitsMode = 'exacto'
    if (visitsRes.error) {
      console.warn('[ai-usage] property_visits.created_by_ai no disponible, uso el conteo estimado:', visitsRes.error.message)
      visitsMode = 'estimado'
      const fallback = await supabase.from('property_visits').select('client_phone, status')
      visitRows = (fallback.data ?? []) as Array<{ client_phone: string | null; status: string }>
    }

    const totals = summarizeTotals(aiStateRows)
    const byDay = groupAnalysesByDay(aiStateRows)
    const visits = summarizeAgentVisits(
      aiStateRows
        .filter(r => r.agent_messages_sent > 0)
        .map(r => ({ phoneE164: r.phone_e164, agentMessagesSent: r.agent_messages_sent })),
      visitRows.map(v => ({ clientPhone: v.client_phone, status: v.status, createdByAi: v.created_by_ai })),
      visitsMode,
    )

    const rate = usdRate.rate
    return NextResponse.json({
      totals: { ...totals, estimatedCostArs: totals.estimatedCostUsd * rate },
      byDay: byDay.map(b => ({ ...b, estimatedCostArs: b.estimatedCostUsd * rate })),
      visits,
      pricePerMillionUsd: AI_TOKEN_PRICE_USD_PER_MILLION,
      usdToArs: { rate, source: usdRate.source },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

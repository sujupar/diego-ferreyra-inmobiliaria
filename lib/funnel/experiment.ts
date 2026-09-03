import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { FALLBACK, normalizeConfig, type ExperimentConfig, type Variant } from './ab-test'

/**
 * Lectura/escritura de la configuración del A/B. SOLO server.
 *
 * REGLA: ninguna falla acá puede tumbar la landing. Si Postgres no responde, si
 * la tabla no existe todavía, si la fila desapareció — se devuelve FALLBACK, que
 * sirve la landing A (la que hoy recibe el tráfico pago).
 */

export interface ExperimentRow extends ExperimentConfig {
  funnel: string
  labelA: string
  labelB: string
  updatedAt: string | null
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Configuración vigente del experimento de un embudo.
 *
 * Se cachea 30 segundos: la landing recibe tráfico pago y no puede pegarle a la
 * base en cada visita, pero mover la barra tiene que verse rápido. Treinta
 * segundos es el punto medio — quien mueve el reparto ve el efecto casi al
 * instante y la base no recibe una consulta por visitante.
 */
export async function getExperiment(funnel: string): Promise<ExperimentRow> {
  const vacio: ExperimentRow = {
    ...FALLBACK, funnel, labelA: 'Actual', labelB: 'Tasación Neta', updatedAt: null,
  }
  try {
    const { data, error } = await admin()
      .from('landing_experiments')
      .select('funnel,status,split_b,winner,variant_a_label,variant_b_label,updated_at')
      .eq('funnel', funnel)
      .maybeSingle()
    if (error || !data) return vacio
    const row = data as Record<string, unknown>
    const cfg = normalizeConfig({
      status: row.status as ExperimentConfig['status'],
      splitB: Number(row.split_b),
      winner: (row.winner ?? null) as Variant | null,
    })
    return {
      ...cfg,
      funnel,
      labelA: String(row.variant_a_label ?? 'Actual'),
      labelB: String(row.variant_b_label ?? 'Tasación Neta'),
      updatedAt: (row.updated_at as string) ?? null,
    }
  } catch {
    return vacio
  }
}

/** Guarda la configuración. Devuelve la fila resultante o null si falló. */
export async function saveExperiment(
  funnel: string,
  next: { status?: string; splitB?: number; winner?: Variant | null },
  userId?: string | null,
): Promise<ExperimentRow | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (next.status !== undefined) patch.status = next.status
  if (next.splitB !== undefined) patch.split_b = Math.round(next.splitB)
  if (next.winner !== undefined) patch.winner = next.winner
  if (userId) patch.updated_by = userId
  try {
    const { error } = await admin().from('landing_experiments').update(patch).eq('funnel', funnel)
    if (error) return null
    return await getExperiment(funnel)
  } catch {
    return null
  }
}

/** Visitas, conversiones y tasa por variante en un rango. [] si algo falla. */
export async function getAbResults(
  funnel: string, from: string, to: string,
): Promise<{ variante: Variant; visitas: number; conversiones: number; tasa: number }[]> {
  try {
    const { data, error } = await admin().rpc('get_landing_ab_results', {
      p_funnel: funnel, p_from: from, p_to: to,
    })
    if (error || !Array.isArray(data)) return []
    return (data as Record<string, unknown>[]).map((r) => ({
      variante: r.variante as Variant,
      visitas: Number(r.visitas ?? 0),
      conversiones: Number(r.conversiones ?? 0),
      tasa: Number(r.tasa ?? 0),
    }))
  } catch {
    return []
  }
}

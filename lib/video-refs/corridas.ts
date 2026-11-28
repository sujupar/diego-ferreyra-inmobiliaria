import type { SupabaseClient } from '@supabase/supabase-js'
import type { FilaCorrida } from './estado-radar'

export type CorridaConAviso = FilaCorrida & { id: string; notificada_at: string | null }

const COLS = 'id, inicio, estado, cuentas_revisadas, reels_mirados, publicadas, mensaje, notificada_at'

/**
 * Las dos corridas que hacen falta para calcular el estado del radar: la última (sea cual
 * sea) y la última que terminó bien. Una sola fuente para la pantalla y para el vigilante,
 * así los dos miran lo mismo.
 */
export async function leerCorridas(db: SupabaseClient): Promise<{ ultima: CorridaConAviso | null; ultimaOk: CorridaConAviso | null }> {
  const [ult, ok] = await Promise.all([
    db.from('radar_corridas').select(COLS).order('inicio', { ascending: false }).limit(1),
    db.from('radar_corridas').select(COLS).in('estado', ['ok', 'parcial']).order('inicio', { ascending: false }).limit(1),
  ])
  return {
    ultima: ((ult.data ?? [])[0] ?? null) as CorridaConAviso | null,
    ultimaOk: ((ok.data ?? [])[0] ?? null) as CorridaConAviso | null,
  }
}

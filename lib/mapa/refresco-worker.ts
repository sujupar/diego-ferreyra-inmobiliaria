/**
 * Una corrida de la actualización mensual del mapa propio: elige UNA celda
 * vencida y la vuelve a descargar. La dispara pg_cron cada 5 minutos
 * (`/api/cron/mapa-lugares`); con 418 celdas, el AMBA entero se refresca en
 * ~35 horas una vez por mes. Las scheduled functions de Netlify no corren en
 * este sitio (ver CLAUDE.md), por eso pg_cron.
 *
 * Tiempo: Overpass con techo de 20 s + guardado (~2 s en la celda más densa):
 * entra en el corte de ~26 s de Netlify.
 */
import { createClient } from '@supabase/supabase-js'
import { elegirCeldaParaActualizar, type EstadoCelda } from './refresco'
import { actualizarCelda } from './actualizar-celda'

const TECHO_DESCARGA_MS = 20_000

export type ResumenRefresco =
  | { ok: true; nada: true }
  | { ok: true; nada: false; celda: string; actualizada: boolean; filas: number; ms: number; error?: string }

export async function correrActualizacionMensual(): Promise<ResumenRefresco> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('mapa_celdas').select('id, estado, actualizado_en, intentado_en, sur, oeste, norte, este')
  if (error) throw new Error(`no se pudieron leer las celdas: ${error.message}`)
  const celdas = (data ?? []) as Array<EstadoCelda & { sur: number; oeste: number; norte: number; este: number }>
  const id = elegirCeldaParaActualizar(celdas, new Date())
  if (!id) return { ok: true, nada: true }
  const c = celdas.find(x => x.id === id)!
  const r = await actualizarCelda(db, { id: c.id, sur: c.sur, oeste: c.oeste, norte: c.norte, este: c.este }, TECHO_DESCARGA_MS)
  if (!r.ok) console.warn(`[mapa-lugares] la celda ${id} no se pudo actualizar (conserva sus datos): ${r.error}`)
  return { ok: true, nada: false, celda: id, actualizada: r.ok, filas: r.filas, ms: r.ms, error: r.error }
}

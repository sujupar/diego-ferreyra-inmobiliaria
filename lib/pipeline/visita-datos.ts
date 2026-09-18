import type { DealStage } from '@/lib/supabase/deals'

/**
 * Cuándo se cargan, se miran y se corrigen los datos de la visita.
 *
 * POR QUÉ EXISTE (2026-09-17): el formulario de la visita solo se abría en
 * "Coordinada", y cerrarlo terminaba la visita. Después de eso no había forma
 * de VER lo cargado ni de corregir un número mal tipeado — y como desde el
 * 2026-09-14 ahí adentro también se cargan los datos de portales y de la
 * landing, un error ahí se arrastraba hasta el aviso publicado.
 *
 * Módulo PURO: sin red, sin base, sin React.
 */

/** Qué hace el botón grande del formulario. */
export type ModoVisita = 'finalizar' | 'editar'

/**
 * Etapas en las que la visita YA ocurrió: lo cargado se puede mirar y corregir,
 * pero el proceso no vuelve a moverse.
 */
const ETAPAS_CON_VISITA_HECHA: readonly string[] = ['visited', 'appraisal_sent', 'followup', 'captured']

/** En "Coordinada" la visita está por hacerse: el botón la FINALIZA y mueve la etapa. */
export const ETAPAS_CON_VISITA_PENDIENTE = ['scheduled', 'not_visited'] as const

export function modoDeVisita(stage: DealStage | string | null | undefined): ModoVisita | null {
  const s = (stage ?? '').trim()
  if ((ETAPAS_CON_VISITA_PENDIENTE as readonly string[]).includes(s)) return 'finalizar'
  if (ETAPAS_CON_VISITA_HECHA.includes(s)) return 'editar'
  return null
}

/**
 * ¿Se ofrece el botón "Datos de la visita"? En las etapas previas (solicitud,
 * clase gratuita) no hay nada que cargar todavía, y en las cerradas
 * (descartado, comprador) no hay nada que corregir.
 */
export function puedeAbrirDatosDeVisita(stage: DealStage | string | null | undefined): boolean {
  return modoDeVisita(stage) !== null
}

export interface ResultadoGuardado {
  ok: boolean
  /** Mensaje ya legible para el asesor. Vacío si salió bien. */
  error: string
}

/**
 * Guarda la visita. Devuelve el resultado en vez de asumir que salió bien:
 * `handleFinalize` no miraba `res.ok`, así que un 403 o un 500 cerraban el
 * modal, movían la pantalla y el asesor creía que había quedado registrado.
 */
export async function guardarDatosDeVisita(
  dealId: string,
  cuerpo: { snapshot: unknown; complete?: boolean },
  buscar: typeof fetch = fetch,
): Promise<ResultadoGuardado> {
  try {
    const res = await buscar(`/api/deals/${dealId}/visit-data`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    if (res.ok) return { ok: true, error: '' }
    // El cuerpo puede no ser JSON (una página de error 504 del gateway): se lee
    // con cuidado para no tapar el problema real con "Unexpected token '<'".
    const detalle = await res.json().then((j: { error?: string }) => j?.error).catch(() => null)
    return { ok: false, error: detalle || `No se pudo guardar (HTTP ${res.status}).` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar.' }
  }
}

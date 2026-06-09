/**
 * Predicado canónico ÚNICO de "campaña Meta completa".
 *
 * Lo usan: page router (V1 vs V2), idempotencia del confirm, builder.isIncomplete,
 * endpoint /meta-campaign GET/PATCH y la pantalla de gestión V1.
 *
 * Sin esto, cada lugar tenía su propia idea de "existe" y producía falsos
 * positivos como el incidente 2026-06-09: una campaña con Campaign+AdSet+0 Ads
 * en status='provisioning' era tratada como "existe" por el confirm (que marcaba
 * el job como published), pero el builder la habría tratado como incompleta y
 * habría reintentado limpio. El desfase es el smoking gun.
 *
 * Regla: una fila de property_meta_campaigns está COMPLETA si y sólo si
 *   - campaign_id no es null/vacío
 *   - adset_id no es null/vacío
 *   - ad_ids es array y tiene ≥1 elementos
 *   - status NO está en {'provisioning', 'archived', 'failed'}
 *
 * Una fila INCOMPLETA es cualquier otra que tenga campaign_id pero no satisfaga
 * los demás criterios — típicamente el resultado de un timeout durante el flow
 * de creación.
 */

export interface CampaignCompletenessRow {
  campaign_id: string | null
  adset_id?: string | null
  ad_ids?: string[] | null
  status?: string | null
}

export function isCampaignComplete(row: CampaignCompletenessRow | null | undefined): boolean {
  if (!row) return false
  if (!row.campaign_id || row.campaign_id.length === 0) return false
  if (!row.adset_id || row.adset_id.length === 0) return false
  const ads = Array.isArray(row.ad_ids) ? row.ad_ids : []
  if (ads.length === 0) return false
  const status = (row.status ?? '').toLowerCase()
  if (['provisioning', 'archived', 'failed'].includes(status)) return false
  return true
}

/**
 * Caso: hay una fila con campaign_id pero la campaña no está completa.
 * Es el escenario "zombi" — Meta tiene Campaign creado pero el flow se cortó.
 */
export function isCampaignZombie(row: CampaignCompletenessRow | null | undefined): boolean {
  if (!row?.campaign_id) return false
  return !isCampaignComplete(row)
}

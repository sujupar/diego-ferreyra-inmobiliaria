/**
 * Sincronización de estado real de Meta → `property_meta_campaigns`.
 *
 * Por qué existe: el panel de campañas nunca volvía a consultar a Meta después
 * de crear/pausar/activar/archivar — el status en DB quedaba "congelado" en lo
 * último que la propia app escribió. Si alguien tocaba la campaña DESDE Meta
 * Ads Manager (la archivaba, la borraba) la app seguía mostrando "paused" o
 * "provisioning" para siempre. Auditoría 2026-07-30: 4 de 4 campañas
 * desincronizadas, todas ARCHIVED en Meta mientras la app decía otra cosa.
 *
 * Este módulo NO crea ni modifica campañas — solo LEE a Meta y refleja la
 * verdad en la fila de `property_meta_campaigns` (nunca borra la fila: es
 * historia).
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { isCampaignComplete, type CampaignCompletenessRow } from './campaign-completeness'

const META_API_BASE = 'https://graph.facebook.com/v21.0'

function getAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) throw new Error('META_ACCESS_TOKEN faltante')
  return token
}

function getAdAccountId(): string {
  const raw = process.env.META_AD_ACCOUNT_ID ?? ''
  return raw.replace(/^act_/, '')
}

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type MetaGetResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; body: unknown }

/**
 * GET de solo lectura contra la Graph API. Nunca hace POST/DELETE — este
 * módulo entero es read-only del lado de Meta.
 */
async function metaGet<T>(path: string): Promise<MetaGetResult<T>> {
  const token = getAccessToken()
  const sep = path.includes('?') ? '&' : '?'
  const url = `${META_API_BASE}${path}${sep}access_token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = text
  }
  if (!res.ok) {
    return { ok: false, status: res.status, body }
  }
  return { ok: true, status: res.status, data: body as T }
}

/**
 * Detecta el error específico de "este objeto ya no existe" que Meta devuelve
 * cuando el ID fue borrado/archivado hace tiempo y el objeto salió del grafo,
 * o cuando directamente nunca existió. Meta lo marca con `error_subcode: 33`
 * (`"Unsupported get request..."`) o un mensaje que contiene "does not exist".
 * Cualquier OTRO error (rate limit, token vencido, 5xx) NO debe interpretarse
 * como "no existe" — eso corrompería el status con un falso archived.
 */
export function isNonexistentObjectError(body: unknown): boolean {
  const err = (body as { error?: { code?: number; error_subcode?: number; message?: string } } | null)
    ?.error
  if (!err) return false
  const msg = typeof err.message === 'string' ? err.message : ''

  // TRAMPA CRÍTICA: el mensaje real de Meta para el subcode 33 es
  //   "Unsupported get request. Object with ID 'X' does not exist, CANNOT BE
  //    LOADED DUE TO MISSING PERMISSIONS, or does not support this operation."
  // O sea: el MISMO error tapa "se borró" y "tu token perdió permisos". Si lo
  // interpretamos como "se borró", un token degradado marca `archived` una
  // campaña ACTIVE que está GASTANDO PLATA — y como la página y el reconcile
  // excluyen las archivadas, el cambio es de hecho irreversible y la UI empuja
  // a crear otra campaña: dos campañas gastando en paralelo.
  // Ante la ambigüedad NO decidimos: si el mensaje menciona permisos, tratamos
  // el error como "no se pudo verificar" y NO tocamos el estado guardado.
  if (/missing permission|permisos/i.test(msg)) return false

  if (err.error_subcode === 33) return true
  if (/does not exist/i.test(msg)) return true
  return false
}

/**
 * Mapeo PURO Meta status/effective_status → status interno de la app.
 *
 * Reglas (Task 9):
 *  - No existe en Meta (borrado) → 'archived', sin importar qué diga metaStatus.
 *  - ACTIVE → 'active'
 *  - PAUSED → 'paused'
 *  - ARCHIVED / DELETED → 'archived'
 *  - Cualquier otro valor (incluido null/desconocido) → 'paused' — conservador:
 *    si no sabemos con certeza que está activa, NO decimos que gasta.
 */
export function mapMetaCampaignStatus(
  metaStatus: string | null,
  exists: boolean,
): 'active' | 'paused' | 'archived' {
  if (!exists) return 'archived'
  const s = (metaStatus ?? '').toUpperCase()
  if (s === 'ACTIVE') return 'active'
  if (s === 'PAUSED') return 'paused'
  if (s === 'ARCHIVED' || s === 'DELETED') return 'archived'
  return 'paused'
}

export type RecoveryDecision = 'recuperar' | 'crear_nueva'

/**
 * Decide si el confirm debe RECUPERAR una campaña ya creada o CREAR UNA NUEVA.
 * Función PURA (sin IO) — existe para poder testear la decisión del bug A2
 * (auditoría 2026-07-31) sin pegarle a la red real: `confirm/route.ts` tenía
 * una rama que, con solo mirar la fila de `property_meta_campaigns`, devolvía
 * "ya estaba creada" — sin preguntarle a Meta si esa campaña seguía existiendo.
 * Un segundo publish después de que alguien la archivó/borró en Ads Manager
 * decía "publicada" sobre una campaña que ya no estaba.
 *
 * Reglas:
 *  - Fila de DB INCOMPLETA (`!isCampaignComplete`) → siempre 'crear_nueva'.
 *    No importa qué diga Meta: el intento anterior nunca terminó de armarse.
 *  - Fila COMPLETA + Meta dice 'archived' (esto incluye "ya no existe", ver
 *    `mapMetaCampaignStatus`) → 'crear_nueva'. Alguien la tocó desde Ads
 *    Manager entre una publicación y la siguiente.
 *  - Fila COMPLETA + Meta dice 'active' o 'paused' (existe, viva) → 'recuperar'.
 *
 * El caso "no se pudo consultar a Meta" (red, rate limit, permisos —
 * `isNonexistentObjectError` devuelve false y `syncCampaignState` tira) es
 * responsabilidad del CALLER: sin `estadoMeta` no hay nada que decidir acá.
 * El caller debe devolver un error pidiendo reintentar, nunca recuperar ni
 * crear a ciegas.
 */
export function decidirRecuperacion(
  filaDB: CampaignCompletenessRow | null | undefined,
  estadoMeta: { status: 'active' | 'paused' | 'archived' },
): RecoveryDecision {
  if (!isCampaignComplete(filaDB)) return 'crear_nueva'
  if (estadoMeta.status === 'archived') return 'crear_nueva'
  return 'recuperar'
}

export interface SyncCampaignResult {
  status: 'active' | 'paused' | 'archived'
  adsetCount: number
  adCount: number
  changed: boolean
}

/**
 * Construye el mensaje que se anota en `last_error` cuando el sync detecta un
 * cambio hecho DESDE AFUERA de la app (Ads Manager). No es un error real —
 * reusamos la columna existente para que quede visible en el panel, tal como
 * ya se hace con `cleanup_zombie_*`.
 */
function buildSyncNote(
  exists: boolean,
  previousStatus: string | null,
  newStatus: SyncCampaignResult['status'],
): string {
  if (!exists) {
    return 'Sincronizado con Meta: la campaña fue eliminada desde Ads Manager'
  }
  return `Sincronizado con Meta: el estado cambió a "${newStatus}" desde Ads Manager (antes: "${previousStatus ?? 'desconocido'}")`
}

/**
 * Sincroniza el estado real de UNA campaña Meta con la fila correspondiente
 * en `property_meta_campaigns`.
 *
 * - GET /{id}?fields=status,effective_status contra Meta.
 * - Si Meta dice que el objeto no existe → tratado como 'archived'.
 * - Cuenta adsets/ads reales (edges de Meta EXCLUYEN archivados — para una
 *   campaña archivada esto da 0/0 legítimamente, no es un bug).
 * - Actualiza la fila SOLO si el status cambió. Nunca borra la fila.
 *
 * `opts.dryRun` (default false): si true, calcula todo pero NO escribe en la
 * base. Pensado para scripts de verificación de solo-lectura — el caller de
 * producción (página, endpoint de reconciliación) nunca debe pasarlo.
 */
export async function syncCampaignState(
  campaignId: string,
  opts: { dryRun?: boolean } = {},
): Promise<SyncCampaignResult> {
  const supabase = getSupabaseAdmin()

  const { data: row } = await supabase
    .from('property_meta_campaigns')
    .select('campaign_id, status, last_error')
    .eq('campaign_id', campaignId)
    .maybeSingle()

  const statusRes = await metaGet<{ status?: string; effective_status?: string }>(
    `/${campaignId}?fields=status,effective_status`,
  )

  let metaStatus: string | null = null
  let exists = true
  if (!statusRes.ok) {
    if (isNonexistentObjectError(statusRes.body)) {
      exists = false
    } else {
      throw new Error(
        `Meta ${statusRes.status} al consultar campaña ${campaignId}: ${JSON.stringify(statusRes.body).slice(0, 500)}`,
      )
    }
  } else {
    metaStatus = statusRes.data.status ?? statusRes.data.effective_status ?? null
  }

  const newStatus = mapMetaCampaignStatus(metaStatus, exists)

  // Edges /adsets y /ads EXCLUYEN objetos archivados — para una campaña
  // archivada esto da legítimamente 0/0, no hay que pedir "deleted" (Meta
  // devuelve 400 subcode 1815001 si se intenta forzar con `is_completed`).
  let adsetCount = 0
  let adCount = 0
  if (exists) {
    const [adsetsRes, adsRes] = await Promise.all([
      metaGet<{ data: unknown[] }>(`/${campaignId}/adsets?fields=id&limit=500`),
      metaGet<{ data: unknown[] }>(`/${campaignId}/ads?fields=id&limit=500`),
    ])
    if (adsetsRes.ok) adsetCount = adsetsRes.data.data?.length ?? 0
    else console.warn(`[meta-sync] no se pudo contar adsets de ${campaignId}:`, adsetsRes.body)
    if (adsRes.ok) adCount = adsRes.data.data?.length ?? 0
    else console.warn(`[meta-sync] no se pudo contar ads de ${campaignId}:`, adsRes.body)
  }

  const previousStatus = row?.status ?? null
  const changed = row != null && previousStatus !== newStatus

  if (changed && !opts.dryRun) {
    // `last_error` NO se pisa: es el único registro de una publicación parcial
    // ("Publicación parcial: 3/6...") y lo que hace que el panel devuelva 409
    // PARTIAL_CAMPAIGN al intentar reactivar una campaña incompleta. Borrarlo
    // desarmaría ese freno en silencio. La nota del sync se APENDA.
    const nota = buildSyncNote(exists, previousStatus, newStatus)
    const previo = (row?.last_error as string | null) ?? null
    const lastError =
      previo && previo.trim() && !previo.includes(nota) ? `${previo} | ${nota}` : nota

    const { error } = await supabase
      .from('property_meta_campaigns')
      .update({ status: newStatus, last_error: lastError })
      .eq('campaign_id', campaignId)
    if (error) {
      console.warn(`[meta-sync] no se pudo persistir el sync de ${campaignId}:`, error.message)
    }
  }

  return { status: newStatus, adsetCount, adCount, changed }
}

/**
 * URL a Meta Ads Manager para una campaña puntual, con el filtro de "Delivery"
 * ampliado para que también aparezcan campañas ARCHIVED/DELETED (por default
 * Ads Manager las esconde, así que un `selected_campaign_ids` de un ID
 * eliminado "no aparece" en la tabla aunque el link cargue bien).
 *
 * OJO: el formato de `filter_set` NO está documentado oficialmente por Meta —
 * es la estructura que arma la propia UI al aplicar un filtro de
 * "Delivery: Todos". Si Meta cambia el formato, el peor caso es que el filtro
 * no se aplique (se comporta como el link viejo, sin filtro) — no rompe nada.
 * Verificado manualmente: pendiente (abrir el link para uno de los 4 IDs
 * conocidos y confirmar que aparece).
 */
export function adsManagerUrl(campaignId: string): string {
  const adAccountId = getAdAccountId()
  const filters = [
    {
      field: 'campaign.effective_status',
      type: 'in',
      value: [
        'ACTIVE',
        'PAUSED',
        'ARCHIVED',
        'DELETED',
        'IN_PROCESS',
        'WITH_ISSUES',
        'PENDING_REVIEW',
        'DISAPPROVED',
        'PREAPPROVED',
        'PENDING_BILLING_INFO',
        'CAMPAIGN_PAUSED',
        'ADSET_PAUSED',
      ],
    },
  ]
  const params = new URLSearchParams({
    act: adAccountId,
    selected_campaign_ids: campaignId,
    filter_set: JSON.stringify(filters),
  })
  return `https://business.facebook.com/adsmanager/manage/campaigns?${params.toString()}`
}

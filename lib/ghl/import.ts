/**
 * Lógica reutilizable de import de oportunidades GHL hacia nuestro CRM.
 *
 * Lo usan:
 *   - scripts/ghl-import.ts (one-shot bulk import, CLI)
 *   - app/api/cron/ghl-poll/route.ts (polling incremental cada 10 min)
 *
 * Garantiza:
 *   - Dedup de contactos por ghl_contact_id → email → phone.
 *   - Dedup de deals por ghl_opportunity_id (índice UNIQUE).
 *   - "Claim" de deals abiertos preexistentes: si el contacto ya tiene un
 *     deal NOT lost/captured sin ghl_opportunity_id, lo UPDATE-a en lugar
 *     de crear duplicado.
 *   - Para Captadas, crea property con flag ghl_imported + task para
 *     coordinador "complete_imported_property".
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const TARGET_PIPELINE_NAME = '🟢 GESTIÓN COMERCIAL - PROPIETARIOS'
const GHL_API_BASE = 'https://services.leadconnectorhq.com'

export type DealStage =
  | 'clase_gratuita' | 'request' | 'scheduled' | 'not_visited' | 'visited'
  | 'appraisal_sent' | 'followup' | 'captured' | 'lost' | 'comprador'

export interface GhlOpportunity {
  id: string
  name: string
  pipelineId: string
  pipelineStageId: string
  status: string
  source?: string
  contactId?: string
  contact?: { id?: string; name?: string; email?: string; phone?: string; tags?: string[] }
  customFields?: Array<{ id?: string; key?: string; fieldKey?: string; value?: unknown; field_value?: unknown }>
  tags?: string[]
  createdAt: string
  updatedAt: string
  monetaryValue?: number
}

interface GhlPipeline {
  id: string
  name: string
  stages: Array<{ id: string; name: string; position: number }>
}

interface GhlContactRecord {
  id?: string
  contactName?: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phone?: string
  source?: string
  tags?: string[]
  customFields?: Array<{ id?: string; key?: string; fieldKey?: string; value?: unknown; field_value?: unknown }>
  customField?: Array<{ id?: string; key?: string; fieldKey?: string; value?: unknown; field_value?: unknown }>
}

interface MappedStage {
  stage: DealStage
  extraTags: string[]
  skip?: boolean
  createProperty?: boolean
}

// ── Stage mapping ────────────────────────────────────────────────────────────
export function mapGhlStageName(name: string): MappedStage {
  const n = name.trim().toLowerCase()
  if (/^llamada\s*\d/.test(n) || /^call\s*\d/.test(n)) {
    return { stage: 'lost', extraTags: [], skip: true }
  }
  if (n === 'registrado clase' || n.includes('clase')) return { stage: 'clase_gratuita', extraTags: [] }
  if (n === 'solicitó tasación' || n === 'solicito tasacion') return { stage: 'request', extraTags: [] }
  if (n === 'descartado') return { stage: 'lost', extraTags: [] }
  if (n.startsWith('seguimiento para tasaci')) return { stage: 'followup', extraTags: ['seguimiento_tasacion'] }
  if (n.startsWith('seguimiento para captaci')) return { stage: 'followup', extraTags: ['seguimiento_captacion'] }
  if (n.startsWith('se coordin')) return { stage: 'scheduled', extraTags: [] }
  if (n.includes('no se realiz')) return { stage: 'not_visited', extraTags: [] }
  if (n.startsWith('se realiz')) return { stage: 'visited', extraTags: [] }
  if (n === 'captada') return { stage: 'captured', extraTags: ['captada_ghl'], createProperty: true }
  if (n === 'colega') return { stage: 'lost', extraTags: ['colega'] }
  if (n === 'quiere comprar') return { stage: 'comprador', extraTags: [] }
  return { stage: 'lost', extraTags: ['ghl_sin_mapeo'] }
}

function stageOrder(stage: string): number {
  const order: Record<string, number> = {
    clase_gratuita: 0, request: 1, scheduled: 2, not_visited: 3,
    visited: 4, appraisal_sent: 5, followup: 6, captured: 7,
    lost: -1, comprador: -1,
  }
  return order[stage] ?? -1
}

export function deriveOrigin(oppSource: string | null | undefined, contactSource: string | null | undefined, stage: DealStage): string {
  const s = (oppSource || contactSource || '').toLowerCase()
  if (stage === 'clase_gratuita' || s.includes('clase propietarios')) return 'clase_gratuita'
  if (s.includes('tasación directa') || s.includes('tasacion directa')) return 'embudo'
  if (s.includes('form embudo')) return 'embudo'
  if (s.includes('guia') || s.includes('guías propietarios') || s.includes('guias propietarios')) return 'embudo'
  if (s.includes('conv') || s.includes('seguimiento')) return 'historico'
  return 'embudo'
}

// ── Custom field IDs (inferidos del discovery) ───────────────────────────────
const CONTACT_CF_MAP = {
  address: 'lVCemPE4yuqyEGLym5cX',
  neighborhood_primary: 'CTwhVoTNFJbhPUvv650o',
  neighborhood_secondary: '1Yo9Go7NxGSnG7HVp1Zp',
  property_type: 'Xdc2vhjmxx7XRQzTSR9A',
  rooms_text: '9knISFzNsoBs8hZuXq2l',
  rooms_numeric: 'PhxtkivV1pjoyvUkq3LL',
  advisor_name: 'ADz2woZJ717aYkspUqXv',
  sale_timeframe: '5pGUf4GOvG6gm61qZK0h',
}

function getCF(contact: GhlContactRecord, key: string): string | null {
  const cf = contact?.customFields || contact?.customField || []
  for (const f of cf) {
    const k = f.fieldKey || f.key || f.id
    if (k === key) {
      const v = f.value ?? f.field_value
      if (v == null || v === '') return null
      return String(v)
    }
  }
  return null
}

function parseRooms(contact: GhlContactRecord): number | null {
  const numeric = getCF(contact, CONTACT_CF_MAP.rooms_numeric)
  if (numeric) {
    const n = parseInt(numeric, 10)
    if (!isNaN(n)) return n
  }
  const text = getCF(contact, CONTACT_CF_MAP.rooms_text)
  if (text) {
    const m = text.match(/(\d+)/)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

function normalizePropertyType(raw: string | null): string {
  if (!raw) return 'departamento'
  const r = raw.trim().toLowerCase()
  if (r === 'ph') return 'ph'
  if (r === 'casa') return 'casa'
  if (r === 'departamento' || r === 'depto') return 'departamento'
  return 'otro'
}

// ── GHL fetchers ─────────────────────────────────────────────────────────────
function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY!}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

export async function fetchPipelines(): Promise<GhlPipeline[]> {
  const url = `${GHL_API_BASE}/opportunities/pipelines?locationId=${process.env.GHL_LOCATION_ID!}`
  const res = await fetch(url, { headers: ghlHeaders() })
  if (!res.ok) throw new Error(`pipelines HTTP ${res.status}`)
  return ((await res.json()).pipelines || []) as GhlPipeline[]
}

/**
 * Fetch oportunidades del pipeline. Soporta corte por fecha de actualización:
 * para polling, se pasa `stopBeforeUpdatedAt` para no descargar opps que no
 * cambiaron desde la última corrida. Asumimos orden por updatedAt DESC (que es
 * lo que GHL devuelve por default).
 */
export async function fetchOpportunities(pipelineId: string, opts?: { stopBeforeUpdatedAt?: string; maxPages?: number }): Promise<GhlOpportunity[]> {
  const all: GhlOpportunity[] = []
  const maxPages = opts?.maxPages ?? 200
  const stopBefore = opts?.stopBeforeUpdatedAt ? new Date(opts.stopBeforeUpdatedAt).getTime() : null
  let page = 1
  while (true) {
    const url = `${GHL_API_BASE}/opportunities/search?location_id=${process.env.GHL_LOCATION_ID!}&pipeline_id=${pipelineId}&limit=100&page=${page}`
    const res = await fetch(url, { headers: ghlHeaders() })
    if (!res.ok) throw new Error(`opportunities HTTP ${res.status} page ${page}`)
    const json = await res.json()
    const batch: GhlOpportunity[] = json.opportunities || []

    let hitOlder = false
    for (const o of batch) {
      if (stopBefore !== null && new Date(o.updatedAt).getTime() < stopBefore) {
        hitOlder = true
        break
      }
      all.push(o)
    }
    if (hitOlder) break
    if (!json.meta?.nextPage) break
    page = json.meta.nextPage
    if (page > maxPages) break
  }
  return all
}

export async function fetchContact(contactId: string): Promise<GhlContactRecord | null> {
  const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, { headers: ghlHeaders() })
  if (!res.ok) return null
  const json = await res.json()
  return (json.contact || json) as GhlContactRecord
}

// ── Dedup helpers ────────────────────────────────────────────────────────────
async function findContactByGhlId(s: SupabaseClient, ghlId: string): Promise<string | null> {
  const { data } = await s.from('contacts').select('id').eq('ghl_contact_id', ghlId).maybeSingle()
  return data?.id || null
}
async function findContactByEmail(s: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await s.from('contacts').select('id').ilike('email', email).maybeSingle()
  return data?.id || null
}
async function findContactByPhone(s: SupabaseClient, phone: string): Promise<string | null> {
  const { data } = await s.from('contacts').select('id').eq('phone', phone).maybeSingle()
  return data?.id || null
}
async function findClaimableDeal(s: SupabaseClient, contactId: string): Promise<{ id: string; stage: string; tags: string[] | null; notes: string | null } | null> {
  const { data } = await s
    .from('deals')
    .select('id, stage, tags, notes, ghl_opportunity_id')
    .eq('contact_id', contactId)
    .is('ghl_opportunity_id', null)
    .not('stage', 'in', '(captured,lost)')
    .order('created_at', { ascending: false })
    .limit(1)
  if (!data || data.length === 0) return null
  return data[0] as { id: string; stage: string; tags: string[] | null; notes: string | null }
}

// ── Result type ──────────────────────────────────────────────────────────────
export type ImportResult =
  | { kind: 'skipped_call_stage' }
  | { kind: 'skipped_existing' }
  | { kind: 'error'; message: string }
  | { kind: 'created'; dealId: string; propertyId?: string }
  | { kind: 'claimed'; dealId: string }

/**
 * Procesa UNA oportunidad de GHL.
 * Idempotente: si el opp ya existe (ghl_opportunity_id), retorna skipped_existing.
 */
export async function importOpportunity(
  supabase: SupabaseClient,
  opp: GhlOpportunity,
  ghlStageName: string,
): Promise<ImportResult> {
  const mapping = mapGhlStageName(ghlStageName)
  if (mapping.skip) return { kind: 'skipped_call_stage' }

  // 1. Dedup por ghl_opportunity_id
  const { data: existingDeal } = await supabase
    .from('deals').select('id').eq('ghl_opportunity_id', opp.id).maybeSingle()
  if (existingDeal) return { kind: 'skipped_existing' }

  const contactId = opp.contactId || opp.contact?.id
  if (!contactId) return { kind: 'error', message: 'sin contactId' }

  const ghlContact = await fetchContact(contactId)
  if (!ghlContact) return { kind: 'error', message: 'fetch contact falló' }

  const contactName = (
    ghlContact.contactName ||
    [ghlContact.firstName, ghlContact.lastName].filter(Boolean).join(' ').trim() ||
    ghlContact.name ||
    opp.contact?.name ||
    opp.name ||
    '(sin nombre)'
  )
  const contactEmail = ghlContact.email || opp.contact?.email || null
  const contactPhone = ghlContact.phone || opp.contact?.phone || null
  const ghlTags: string[] = ghlContact.tags || opp.contact?.tags || []

  // 2. Dedup contact: ghl_id → email → phone
  let ourContactId: string | null = null
  ourContactId = await findContactByGhlId(supabase, contactId)
  if (!ourContactId && contactEmail) ourContactId = await findContactByEmail(supabase, contactEmail)
  if (!ourContactId && contactPhone) ourContactId = await findContactByPhone(supabase, contactPhone)

  const finalTags = Array.from(new Set([...ghlTags, ...mapping.extraTags]))
  const origin = deriveOrigin(opp.source, ghlContact.source, mapping.stage)

  if (!ourContactId) {
    const { data, error } = await supabase.from('contacts').insert({
      full_name: contactName,
      email: contactEmail,
      phone: contactPhone,
      origin,
      notes: `Importado de GHL\nGHL contact_id: ${contactId}\nGHL source: ${ghlContact.source || '—'}`,
      tags: finalTags,
      ghl_contact_id: contactId,
    }).select('id').single()
    if (error) return { kind: 'error', message: `contact insert: ${error.message}` }
    ourContactId = data.id
  } else {
    // Merge tags + ghl_contact_id
    const { data: cur } = await supabase.from('contacts').select('tags, ghl_contact_id').eq('id', ourContactId).single()
    const merged = Array.from(new Set([...(cur?.tags || []), ...finalTags]))
    await supabase.from('contacts').update({
      tags: merged,
      ghl_contact_id: cur?.ghl_contact_id || contactId,
    }).eq('id', ourContactId)
  }

  // 3. Claim vs create deal
  const propertyAddressForDeal =
    getCF(ghlContact, CONTACT_CF_MAP.address) || `[Importado GHL] ${contactName}`
  const neighborhoodFromCF =
    getCF(ghlContact, CONTACT_CF_MAP.neighborhood_primary) ||
    getCF(ghlContact, CONTACT_CF_MAP.neighborhood_secondary) ||
    null

  const dealNotes = [
    `Importado de GHL (opp ${opp.id})`,
    `Stage GHL: ${ghlStageName}`,
    `Source GHL: ${opp.source || '—'}`,
    `Contact source: ${ghlContact.source || '—'}`,
    neighborhoodFromCF ? `Barrio: ${neighborhoodFromCF}` : null,
    getCF(ghlContact, CONTACT_CF_MAP.sale_timeframe) ? `Plazo: ${getCF(ghlContact, CONTACT_CF_MAP.sale_timeframe)}` : null,
    getCF(ghlContact, CONTACT_CF_MAP.advisor_name) ? `Asesor GHL: ${getCF(ghlContact, CONTACT_CF_MAP.advisor_name)}` : null,
  ].filter(Boolean).join('\n')

  if (!ourContactId) return { kind: 'error', message: 'contact id null tras insert/match' }
  const claimable = await findClaimableDeal(supabase, ourContactId)

  let dealId: string
  if (claimable) {
    const mergedTags = Array.from(new Set([...(claimable.tags || []), ...finalTags]))
    const mergedNotes = [claimable.notes || '', '', '── Datos del import GHL ──', dealNotes]
      .filter(s => s !== null && s !== undefined).join('\n').trim()
    const newStage = stageOrder(claimable.stage) < stageOrder(mapping.stage) ? mapping.stage : claimable.stage
    const { error } = await supabase.from('deals').update({
      ghl_opportunity_id: opp.id,
      ghl_contact_id: contactId,
      tags: mergedTags,
      notes: mergedNotes,
      stage: newStage,
      stage_changed_at: opp.updatedAt || opp.createdAt,
      neighborhood: neighborhoodFromCF || undefined,
    }).eq('id', claimable.id)
    if (error) return { kind: 'error', message: `claim deal: ${error.message}` }
    dealId = claimable.id
    return { kind: 'claimed', dealId }
  }

  // Create
  const { data, error } = await supabase.from('deals').insert({
    contact_id: ourContactId,
    property_address: propertyAddressForDeal,
    origin,
    notes: dealNotes,
    stage: mapping.stage,
    neighborhood: neighborhoodFromCF,
    tags: finalTags,
    ghl_opportunity_id: opp.id,
    ghl_contact_id: contactId,
    stage_changed_at: opp.updatedAt || opp.createdAt,
    created_at: opp.createdAt,
  }).select('id').single()
  if (error) return { kind: 'error', message: `insert deal: ${error.message}` }
  dealId = data.id

  // 4. Captada → property + task
  let propertyId: string | undefined
  if (mapping.createProperty) {
    const address = getCF(ghlContact, CONTACT_CF_MAP.address) || `[PENDIENTE — Importado GHL] ${contactName}`
    const neighborhood = neighborhoodFromCF || '[PENDIENTE]'
    const ptype = normalizePropertyType(getCF(ghlContact, CONTACT_CF_MAP.property_type))
    const rooms = parseRooms(ghlContact)

    const allCf: Record<string, string | null> = {}
    for (const f of (ghlContact.customFields || ghlContact.customField || [])) {
      const k = f.fieldKey || f.key || f.id || ''
      allCf[k] = (f.value ?? f.field_value ?? null) as string | null
    }

    const { data: prop, error: pErr } = await supabase.from('properties').insert({
      contact_id: ourContactId,
      address, neighborhood, city: 'CABA',
      property_type: ptype,
      rooms,
      asking_price: 0,
      currency: 'USD',
      commission_percentage: 0,
      origin,
      status: 'approved',
      legal_status: 'approved',
      legal_notes: 'Importada de GHL — legal review preexistente',
      legal_reviewed_at: opp.updatedAt || opp.createdAt,
      ghl_imported: true,
      ghl_opportunity_id: opp.id,
      ghl_custom_fields: allCf,
      created_at: opp.createdAt,
    }).select('id').single()
    if (!pErr && prop) {
      propertyId = prop.id
      await supabase.from('deals').update({ property_id: propertyId }).eq('id', dealId)

      // Tasks para coordinadores
      const { data: coordinators } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'coordinador')
        .eq('is_active', true)
      const missing = ['precio de venta', 'comisión', 'm² cubiertos/totales', 'fotos', 'documentos legales']
      for (const c of coordinators || []) {
        await supabase.from('tasks').insert({
          type: 'complete_imported_property',
          title: `Completar datos importados de GHL: ${contactName}`,
          description: `Property importada del GHL — falta: ${missing.join(', ')}.\nVerificar dirección y completar campos comerciales.`,
          status: 'pending',
          property_id: propertyId,
          contact_id: ourContactId,
          assigned_to: c.id,
        })
      }
    }
  }

  return { kind: 'created', dealId, propertyId }
}

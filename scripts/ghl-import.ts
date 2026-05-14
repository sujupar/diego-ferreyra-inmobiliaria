#!/usr/bin/env tsx
/**
 * GHL Importer — backfill histórico del pipeline
 * "🟢 GESTIÓN COMERCIAL - PROPIETARIOS" hacia nuestro CRM.
 *
 * Modos:
 *   npx tsx scripts/ghl-import.ts --dry-run               (no escribe nada)
 *   npx tsx scripts/ghl-import.ts --limit 10 --dry-run
 *   npx tsx scripts/ghl-import.ts --limit 10 --commit     (escribe esos 10)
 *   npx tsx scripts/ghl-import.ts --commit                (escribe todos)
 *
 * Reglas:
 *   - Stages "Llamada 1/2/3" → OMITIR.
 *   - Stage "Colega" → import como `lost` + tag 'colega' (filtro oculto en UI).
 *   - Stage "Quiere Comprar" → import como nuevo stage 'comprador'.
 *   - Stage "Captada" → import como `captured` + crear `property` flag
 *     `ghl_imported=true` + task "completar datos importados".
 *   - Dedup: contacts por ghl_contact_id → email → phone. Deals por
 *     ghl_opportunity_id. Re-ejecutar es seguro (UPSERT semántico).
 *
 * Mapping de fieldKeys (inferido del discovery, ver scripts/ghl-discover.ts):
 *   lVCemPE4yuqyEGLym5cX → address
 *   CTwhVoTNFJbhPUvv650o → neighborhood (form tasacion directa)
 *   1Yo9Go7NxGSnG7HVp1Zp → neighborhood (form embudo)
 *   7wx4hlIcmSsMVLdx2JaZ → locality
 *   Xdc2vhjmxx7XRQzTSR9A → property_type
 *   9knISFzNsoBs8hZuXq2l → rooms_text (ej. "4 Ambientes")
 *   PhxtkivV1pjoyvUkq3LL → rooms_numeric
 *   TFMWFLsYlA00rFI2bUJD → appraisal_date
 *   ADz2woZJ717aYkspUqXv → advisor_name (no se importa al assigned_to)
 *   kBVtbx6hyk7Ae8Opuqiq → lead_origin
 *   5pGUf4GOvG6gm61qZK0h → sale_timeframe
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnvLocal()

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run') || !args.includes('--commit')
const COMMIT = args.includes('--commit')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1] || '0', 10) : 0

if (DRY_RUN && COMMIT) {
  console.error('No puede haber --dry-run y --commit a la vez.')
  process.exit(1)
}

// ── GHL config ───────────────────────────────────────────────────────────────
const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const TARGET_PIPELINE_NAME = '🟢 GESTIÓN COMERCIAL - PROPIETARIOS'

function ghlHeaders() {
  const apiKey = process.env.GHL_API_KEY!
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

const LOCATION_ID = process.env.GHL_LOCATION_ID!

// ── Stage mapping ────────────────────────────────────────────────────────────
type DealStage =
  | 'clase_gratuita' | 'request' | 'scheduled' | 'not_visited' | 'visited'
  | 'appraisal_sent' | 'followup' | 'captured' | 'lost' | 'comprador'

interface MappedStage {
  stage: DealStage
  extraTags: string[]
  /** Si true, no importamos la opp. */
  skip?: boolean
  /** Si true, crear property además del deal. */
  createProperty?: boolean
}

function mapGhlStageName(name: string): MappedStage {
  const n = name.trim().toLowerCase()

  if (/^llamada\s*\d/.test(n) || /^call\s*\d/.test(n)) {
    return { stage: 'lost', extraTags: [], skip: true }
  }
  if (n === 'registrado clase' || n.includes('clase')) {
    return { stage: 'clase_gratuita', extraTags: [] }
  }
  if (n === 'solicitó tasación' || n === 'solicito tasacion') {
    return { stage: 'request', extraTags: [] }
  }
  if (n === 'descartado') {
    return { stage: 'lost', extraTags: [] }
  }
  if (n.startsWith('seguimiento para tasaci')) {
    return { stage: 'followup', extraTags: ['seguimiento_tasacion'] }
  }
  if (n.startsWith('seguimiento para captaci')) {
    return { stage: 'followup', extraTags: ['seguimiento_captacion'] }
  }
  if (n.startsWith('se coordin')) {
    return { stage: 'scheduled', extraTags: [] }
  }
  if (n.includes('no se realiz')) {
    return { stage: 'not_visited', extraTags: [] }
  }
  if (n.startsWith('se realiz')) {
    return { stage: 'visited', extraTags: [] }
  }
  if (n === 'captada') {
    return { stage: 'captured', extraTags: ['captada_ghl'], createProperty: true }
  }
  if (n === 'colega') {
    return { stage: 'lost', extraTags: ['colega'] }
  }
  if (n === 'quiere comprar') {
    return { stage: 'comprador', extraTags: [] }
  }
  console.warn(`⚠ stage GHL sin mapeo: "${name}" → cae a 'lost' con tag 'ghl_sin_mapeo'`)
  return { stage: 'lost', extraTags: ['ghl_sin_mapeo'] }
}

/** Orden de "madurez" del flujo. Más alto = más avanzado. Sirve para decidir
 * si un claim avanza el stage o no lo retrocede. lost/comprador son ramas
 * separadas, las tratamos como neutrales (no comparan vs flow lineal). */
function stageOrder(stage: string): number {
  const order: Record<string, number> = {
    clase_gratuita: 0, request: 1, scheduled: 2, not_visited: 3,
    visited: 4, appraisal_sent: 5, followup: 6, captured: 7,
    lost: -1, comprador: -1,
  }
  return order[stage] ?? -1
}

// ── Source → origin ──────────────────────────────────────────────────────────
function deriveOrigin(oppSource: string | null | undefined, contactSource: string | null | undefined, stage: DealStage): string {
  const s = (oppSource || contactSource || '').toLowerCase()
  if (stage === 'clase_gratuita' || s.includes('clase propietarios')) return 'clase_gratuita'
  if (s.includes('tasación directa') || s.includes('tasacion directa')) return 'embudo'
  if (s.includes('form embudo')) return 'embudo'
  if (s.includes('guia') || s.includes('guías propietarios') || s.includes('guias propietarios')) return 'embudo'
  if (s.includes('conv') || s.includes('seguimiento')) return 'historico'
  return 'embudo'
}

// ── Custom field extraction ──────────────────────────────────────────────────
const CONTACT_CF_MAP = {
  address: 'lVCemPE4yuqyEGLym5cX',
  neighborhood_primary: 'CTwhVoTNFJbhPUvv650o',
  neighborhood_secondary: '1Yo9Go7NxGSnG7HVp1Zp',
  locality: '7wx4hlIcmSsMVLdx2JaZ',
  property_type: 'Xdc2vhjmxx7XRQzTSR9A',
  rooms_text: '9knISFzNsoBs8hZuXq2l',
  rooms_numeric: 'PhxtkivV1pjoyvUkq3LL',
  appraisal_date: 'TFMWFLsYlA00rFI2bUJD',
  advisor_name: 'ADz2woZJ717aYkspUqXv',
  lead_origin: 'kBVtbx6hyk7Ae8Opuqiq',
  sale_timeframe: '5pGUf4GOvG6gm61qZK0h',
}

function getCF(contact: any, key: string): string | null {
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

function parseRooms(contact: any): number | null {
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

// ── Supabase ─────────────────────────────────────────────────────────────────
function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── GHL fetchers ─────────────────────────────────────────────────────────────
interface Pipeline { id: string; name: string; stages: Array<{ id: string; name: string; position: number }> }
interface Opportunity {
  id: string
  name: string
  pipelineId: string
  pipelineStageId: string
  status: string
  source?: string
  contactId?: string
  contact?: { id?: string; name?: string; email?: string; phone?: string; tags?: string[] }
  customFields?: any[]
  tags?: string[]
  createdAt: string
  updatedAt: string
  monetaryValue?: number
}

async function fetchPipelines(): Promise<Pipeline[]> {
  const res = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${LOCATION_ID}`, { headers: ghlHeaders() })
  if (!res.ok) throw new Error(`pipelines HTTP ${res.status}`)
  return ((await res.json()).pipelines || []) as Pipeline[]
}

async function fetchAllOpportunities(pipelineId: string): Promise<Opportunity[]> {
  const all: Opportunity[] = []
  let page = 1
  while (true) {
    const url = `${GHL_API_BASE}/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${pipelineId}&limit=100&page=${page}`
    const res = await fetch(url, { headers: ghlHeaders() })
    if (!res.ok) throw new Error(`opportunities HTTP ${res.status} page ${page}`)
    const json = await res.json()
    const batch: Opportunity[] = json.opportunities || []
    all.push(...batch)
    if (!json.meta?.nextPage) break
    page = json.meta.nextPage
    if (page > 200) break
  }
  return all
}

const contactCache = new Map<string, any>()
async function fetchContact(contactId: string): Promise<any> {
  if (contactCache.has(contactId)) return contactCache.get(contactId)
  const res = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, { headers: ghlHeaders() })
  if (!res.ok) {
    console.warn(`  ⚠ contact ${contactId}: HTTP ${res.status}`)
    return null
  }
  const json = await res.json()
  const contact = json.contact || json
  contactCache.set(contactId, contact)
  return contact
}

// ── Dedup helpers ────────────────────────────────────────────────────────────
async function findContactByGhlId(supabase: SupabaseClient, ghlId: string): Promise<string | null> {
  const { data } = await supabase.from('contacts').select('id').eq('ghl_contact_id', ghlId).maybeSingle()
  return data?.id || null
}
async function findContactByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await supabase.from('contacts').select('id').ilike('email', email).maybeSingle()
  return data?.id || null
}
async function findContactByPhone(supabase: SupabaseClient, phone: string): Promise<string | null> {
  const { data } = await supabase.from('contacts').select('id').eq('phone', phone).maybeSingle()
  return data?.id || null
}

/**
 * Busca un deal "abierto" del contacto al que podamos pegarle el ghl_opportunity_id.
 *
 * Un deal abierto es uno cuya stage NO es 'captured' ni 'lost' y no tiene ya
 * un ghl_opportunity_id distinto. Si encontramos uno, lo "claimamos" — la
 * historia de GHL pisa al deal pre-existente en vez de duplicarlo.
 *
 * Heurística: el deal más reciente del contacto que esté abierto.
 */
async function findClaimableDeal(supabase: SupabaseClient, contactId: string): Promise<{ id: string; stage: string; tags: string[] | null; notes: string | null } | null> {
  const { data } = await supabase
    .from('deals')
    .select('id, stage, tags, notes, ghl_opportunity_id')
    .eq('contact_id', contactId)
    .is('ghl_opportunity_id', null)
    .not('stage', 'in', '(captured,lost)')
    .order('created_at', { ascending: false })
    .limit(1)
  if (!data || data.length === 0) return null
  return data[0] as any
}

// ── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  total: 0,
  skipped_call_stages: 0,
  skipped_existing: 0,
  contacts_created: 0,
  contacts_reused: 0,
  deals_created: 0,
  deals_claimed: 0,
  properties_created: 0,
  tasks_created: 0,
  errors: 0,
  by_stage: new Map<string, number>(),
}

function bump(key: string) {
  stats.by_stage.set(key, (stats.by_stage.get(key) || 0) + 1)
}

// ── Main importer ────────────────────────────────────────────────────────────
async function processOpportunity(supabase: SupabaseClient, opp: Opportunity, ghlStageName: string) {
  stats.total++

  const mapping = mapGhlStageName(ghlStageName)
  if (mapping.skip) {
    stats.skipped_call_stages++
    return
  }
  bump(mapping.stage)

  // 1. Dedup deal por ghl_opportunity_id
  const { data: existingDeal } = await supabase
    .from('deals').select('id').eq('ghl_opportunity_id', opp.id).maybeSingle()
  if (existingDeal) {
    stats.skipped_existing++
    return
  }

  const contactId = opp.contactId || opp.contact?.id
  if (!contactId) {
    console.warn(`  ⚠ opp ${opp.id} (${opp.name}) sin contactId — saltando`)
    stats.errors++
    return
  }

  // 2. Fetch contact completo (con todos los custom fields)
  const ghlContact = await fetchContact(contactId)
  if (!ghlContact) {
    stats.errors++
    return
  }

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

  // 3. Dedup contact: ghl_id → email → phone → create
  let ourContactId: string | null = null
  ourContactId = await findContactByGhlId(supabase, contactId)
  if (!ourContactId && contactEmail) ourContactId = await findContactByEmail(supabase, contactEmail)
  if (!ourContactId && contactPhone) ourContactId = await findContactByPhone(supabase, contactPhone)

  const finalTags = Array.from(new Set([...ghlTags, ...mapping.extraTags]))
  const origin = deriveOrigin(opp.source, ghlContact.source, mapping.stage)

  if (!ourContactId) {
    if (!DRY_RUN) {
      const { data, error } = await supabase.from('contacts').insert({
        full_name: contactName,
        email: contactEmail,
        phone: contactPhone,
        origin,
        notes: `Importado de GHL\nGHL contact_id: ${contactId}\nGHL source: ${ghlContact.source || '—'}`,
        tags: finalTags,
        ghl_contact_id: contactId,
      }).select('id').single()
      if (error) {
        console.warn(`  ⚠ insert contact falló: ${error.message}`)
        stats.errors++
        return
      }
      ourContactId = data.id
    } else {
      ourContactId = '<dry-run-new-contact>'
    }
    stats.contacts_created++
  } else {
    // Si ya existe, complementamos: tags + ghl_contact_id si falta
    if (!DRY_RUN) {
      const { data: cur } = await supabase.from('contacts').select('tags, ghl_contact_id').eq('id', ourContactId).single()
      const merged = Array.from(new Set([...(cur?.tags || []), ...finalTags]))
      await supabase.from('contacts').update({
        tags: merged,
        ghl_contact_id: cur?.ghl_contact_id || contactId,
      }).eq('id', ourContactId)
    }
    stats.contacts_reused++
  }

  // 4. Crear o claimar el deal
  const propertyAddressForDeal =
    getCF(ghlContact, CONTACT_CF_MAP.address) ||
    `[Importado GHL] ${contactName}`
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

  // Buscar un deal abierto del mismo contacto que ya exista en nuestra DB
  // (típicamente creado por el webhook GHL anterior). Si lo encontramos,
  // claimamos ese en lugar de crear uno nuevo — eso evita duplicados.
  const claimable = ourContactId.startsWith('<dry-run')
    ? null
    : await findClaimableDeal(supabase, ourContactId)

  let dealId: string | null = null
  if (claimable) {
    // CLAIM: merge data del import en el deal existente.
    const mergedTags = Array.from(new Set([...(claimable.tags || []), ...finalTags]))
    const mergedNotes = [claimable.notes || '', '', '── Datos del import GHL ──', dealNotes]
      .filter(s => s !== null && s !== undefined).join('\n').trim()
    if (!DRY_RUN) {
      const { error } = await supabase.from('deals').update({
        ghl_opportunity_id: opp.id,
        ghl_contact_id: contactId,
        tags: mergedTags,
        notes: mergedNotes,
        // Si nuestro deal está en un stage ANTERIOR al de GHL, lo avanzamos.
        // Si nuestro stage es POSTERIOR (más maduro), no retrocedemos.
        stage: stageOrder(claimable.stage) < stageOrder(mapping.stage) ? mapping.stage : claimable.stage,
        stage_changed_at: opp.updatedAt || opp.createdAt,
        neighborhood: neighborhoodFromCF || undefined,
      }).eq('id', claimable.id)
      if (error) {
        console.warn(`  ⚠ claim deal falló: ${error.message}`)
        stats.errors++
        return
      }
      dealId = claimable.id
    } else {
      dealId = claimable.id
    }
    stats.deals_claimed++
  } else {
    // CREATE: no hay deal abierto, creamos uno nuevo.
    if (!DRY_RUN) {
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
      if (error) {
        console.warn(`  ⚠ insert deal falló: ${error.message}`)
        stats.errors++
        return
      }
      dealId = data.id
    } else {
      dealId = '<dry-run-new-deal>'
    }
    stats.deals_created++
  }

  // 5. Si es captada → crear property + task
  if (mapping.createProperty) {
    const address = getCF(ghlContact, CONTACT_CF_MAP.address) || `[PENDIENTE — Importado GHL] ${contactName}`
    const neighborhood = neighborhoodFromCF || '[PENDIENTE]'
    const ptype = normalizePropertyType(getCF(ghlContact, CONTACT_CF_MAP.property_type))
    const rooms = parseRooms(ghlContact)

    // Guardamos todos los CF crudos del contact por las dudas
    const allCf: Record<string, string | null> = {}
    for (const f of (ghlContact.customFields || ghlContact.customField || [])) {
      const k = f.fieldKey || f.key || f.id
      allCf[k] = (f.value ?? f.field_value ?? null) as string | null
    }

    let propertyId: string | null = null
    if (!DRY_RUN) {
      const { data, error } = await supabase.from('properties').insert({
        contact_id: ourContactId,
        address,
        neighborhood,
        city: 'CABA',
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
      if (error) {
        console.warn(`  ⚠ insert property falló: ${error.message}`)
        stats.errors++
      } else {
        propertyId = data.id
        // Link bidireccional: deal.property_id = propertyId
        if (dealId) {
          await supabase.from('deals').update({ property_id: propertyId }).eq('id', dealId)
        }
      }
    } else {
      propertyId = '<dry-run-new-property>'
    }
    if (propertyId) stats.properties_created++

    // Task de completar datos
    const missing: string[] = []
    if (!getCF(ghlContact, CONTACT_CF_MAP.address)) missing.push('dirección')
    if (!neighborhoodFromCF) missing.push('barrio')
    missing.push('precio de venta', 'comisión', 'm² cubiertos/totales', 'fotos', 'documentos legales')

    if (!DRY_RUN && propertyId) {
      // Asignar a TODOS los coordinadores activos (mismo patrón que createTaskForRole)
      const { data: coordinators } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'coordinador')
        .eq('is_active', true)
      for (const c of coordinators || []) {
        const { error: tErr } = await supabase.from('tasks').insert({
          type: 'complete_imported_property',
          title: `Completar datos importados de GHL: ${contactName}`,
          description: `Property importada del GHL — falta: ${missing.join(', ')}.\nVerificar dirección y completar campos comerciales.`,
          status: 'pending',
          property_id: propertyId,
          contact_id: ourContactId,
          assigned_to: c.id,
        })
        if (tErr) {
          console.warn(`  ⚠ insert task falló: ${tErr.message}`)
        }
      }
      if ((coordinators || []).length > 0) stats.tasks_created++
    } else if (DRY_RUN) {
      stats.tasks_created++
    }
  }
}

async function main() {
  console.log(`\n${DRY_RUN ? '🔍 DRY-RUN' : '🔥 COMMIT'} — GHL Importer`)
  if (LIMIT > 0) console.log(`Límite: ${LIMIT} oportunidades`)
  console.log()

  const supabase = getSupabase()

  console.log('Fetching pipelines...')
  const pipelines = await fetchPipelines()
  const target = pipelines.find(p => p.name === TARGET_PIPELINE_NAME)
  if (!target) {
    console.error(`Pipeline "${TARGET_PIPELINE_NAME}" no encontrado.`)
    process.exit(1)
  }
  const stageMap = new Map(target.stages.map(s => [s.id, s.name]))

  console.log(`Fetching opportunities (pipeline: ${target.name})...`)
  const opps = await fetchAllOpportunities(target.id)
  console.log(`${opps.length} oportunidades en total.\n`)

  const toProcess = LIMIT > 0 ? opps.slice(0, LIMIT) : opps

  for (let i = 0; i < toProcess.length; i++) {
    const opp = toProcess[i]
    const stageName = stageMap.get(opp.pipelineStageId) || '(stage desconocido)'
    process.stdout.write(`\r[${i + 1}/${toProcess.length}] ${opp.name.substring(0, 40).padEnd(40)} → ${stageName.substring(0, 30).padEnd(30)}  `)
    try {
      await processOpportunity(supabase, opp, stageName)
    } catch (err) {
      console.error(`\n  ⚠ error procesando ${opp.id}:`, err instanceof Error ? err.message : err)
      stats.errors++
    }
  }

  console.log('\n\n══════════════════════════════════════════════════════════════════════')
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'COMMIT'} RESUMEN`)
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log(`Total procesadas:        ${stats.total}`)
  console.log(`Skipped (Llamada 1/2/3): ${stats.skipped_call_stages}`)
  console.log(`Skipped (ya existían):   ${stats.skipped_existing}`)
  console.log(`Contactos creados:       ${stats.contacts_created}`)
  console.log(`Contactos reusados:      ${stats.contacts_reused}`)
  console.log(`Deals creados:           ${stats.deals_created}`)
  console.log(`Deals reusados (merge):  ${stats.deals_claimed}`)
  console.log(`Properties creadas:      ${stats.properties_created}`)
  console.log(`Tasks creadas:           ${stats.tasks_created}`)
  console.log(`Errores:                 ${stats.errors}`)
  console.log()
  console.log('Por stage destino:')
  const sorted = [...stats.by_stage.entries()].sort((a, b) => b[1] - a[1])
  for (const [s, n] of sorted) console.log(`  ${String(n).padStart(4)}  ${s}`)
  console.log()

  if (DRY_RUN) {
    console.log('Nada se escribió. Re-corré con --commit para aplicar.')
  } else {
    console.log('✅ Import terminado.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

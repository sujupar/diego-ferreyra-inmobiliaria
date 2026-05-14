#!/usr/bin/env tsx
/**
 * GHL Discovery — READ-ONLY.
 *
 * Inspecciona el pipeline "🟢 GESTIÓN COMERCIAL - PROPIETARIOS" en GHL y
 * reporta su estructura SIN tocar Supabase ni GHL. Lo que devuelve nos sirve
 * para definir el mapeo de stages, custom fields y tags antes del import real.
 *
 * Output:
 *   - Lista de pipelines con stage count y opp count
 *   - Stages del pipeline target con cantidad de oportunidades en cada uno
 *   - Lista distinta de custom field keys (con sample value y conteo)
 *   - Lista distinta de tags (con conteo, si la API las devuelve)
 *   - 3 oportunidades de muestra como JSON crudo (para ver toda la forma)
 *
 * Uso:
 *   npx tsx scripts/ghl-discover.ts
 *   npx tsx scripts/ghl-discover.ts --pipeline "otro nombre"   # override
 *   npx tsx scripts/ghl-discover.ts --all                      # todos los pipelines
 */
import fs from 'node:fs'
import path from 'node:path'

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

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const DEFAULT_PIPELINE_NAME = '🟢 GESTIÓN COMERCIAL - PROPIETARIOS'

const args = process.argv.slice(2)
const ALL_PIPELINES = args.includes('--all')
const INSPECT_CAPTADAS = args.includes('--captadas')
const INSPECT_GLOBAL_CF = args.includes('--global-cf')
const pipelineArgIdx = args.indexOf('--pipeline')
const TARGET_PIPELINE_NAME =
  pipelineArgIdx >= 0 ? args[pipelineArgIdx + 1] : DEFAULT_PIPELINE_NAME

function headers() {
  const apiKey = process.env.GHL_API_KEY
  if (!apiKey) throw new Error('GHL_API_KEY no está en .env.local')
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

function locationId() {
  const id = process.env.GHL_LOCATION_ID
  if (!id) throw new Error('GHL_LOCATION_ID no está en .env.local')
  return id
}

interface Pipeline {
  id: string
  name: string
  stages: Array<{ id: string; name: string; position: number }>
}

interface Opportunity {
  id: string
  name: string
  pipelineId: string
  pipelineStageId: string
  status: string
  monetaryValue?: number
  contact?: { id: string; name?: string; email?: string; phone?: string }
  customFields?: Array<{ id: string; key?: string; fieldKey?: string; value?: unknown; field_value?: unknown }>
  tags?: string[]
  createdAt: string
  updatedAt: string
  assignedTo?: string
  source?: string
  notes?: unknown
}

async function fetchPipelines(): Promise<Pipeline[]> {
  const url = `${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId()}`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Pipelines API ${res.status}: ${t.substring(0, 300)}`)
  }
  const json = await res.json()
  return json.pipelines || []
}

async function fetchAllOpportunities(pipelineId: string): Promise<Opportunity[]> {
  const all: Opportunity[] = []
  let page = 1
  while (true) {
    const url =
      `${GHL_API_BASE}/opportunities/search?location_id=${locationId()}` +
      `&pipeline_id=${pipelineId}&limit=100&page=${page}`
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Opportunities API ${res.status} (page ${page}): ${t.substring(0, 300)}`)
    }
    const json = await res.json()
    const batch: Opportunity[] = json.opportunities || []
    all.push(...batch)
    const next = json.meta?.nextPage
    if (!next) break
    page = next
    if (page > 200) {
      console.warn('Pagination cutoff at 200 pages — más datos podrían existir')
      break
    }
  }
  return all
}

function bar(n: number, max: number, width = 30) {
  const filled = Math.round((n / Math.max(max, 1)) * width)
  return '█'.repeat(filled) + '·'.repeat(width - filled)
}

async function inspectPipeline(p: Pipeline) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`PIPELINE: ${p.name}`)
  console.log(`ID: ${p.id}`)
  console.log(`Stages: ${p.stages.length}`)
  console.log(`${'═'.repeat(70)}`)

  const opps = await fetchAllOpportunities(p.id)
  console.log(`\nTOTAL OPORTUNIDADES: ${opps.length}\n`)

  // Conteo por stage
  const stageCount = new Map<string, number>()
  for (const o of opps) {
    stageCount.set(o.pipelineStageId, (stageCount.get(o.pipelineStageId) || 0) + 1)
  }
  const maxCount = Math.max(...Array.from(stageCount.values()), 1)

  console.log('STAGES (en orden de pipeline):')
  console.log('─'.repeat(70))
  const sortedStages = [...p.stages].sort((a, b) => a.position - b.position)
  for (const s of sortedStages) {
    const n = stageCount.get(s.id) || 0
    console.log(`  ${String(n).padStart(4)}  ${bar(n, maxCount)}  ${s.name}`)
  }

  // Custom fields
  const cfCount = new Map<string, { count: number; sample: string }>()
  for (const o of opps) {
    for (const f of o.customFields || []) {
      const key = f.key || f.fieldKey || f.id || '(sin key)'
      const existing = cfCount.get(key)
      const v = f.value ?? f.field_value
      const sample = typeof v === 'string' ? v.substring(0, 40) : JSON.stringify(v).substring(0, 40)
      if (existing) existing.count++
      else cfCount.set(key, { count: 1, sample })
    }
  }
  console.log(`\nCUSTOM FIELDS encontrados (${cfCount.size}):`)
  console.log('─'.repeat(70))
  const sortedCf = [...cfCount.entries()].sort((a, b) => b[1].count - a[1].count)
  for (const [key, info] of sortedCf) {
    console.log(`  ${String(info.count).padStart(4)}× ${key.padEnd(40)} ej: ${info.sample}`)
  }

  // Tags
  const tagCount = new Map<string, number>()
  for (const o of opps) {
    for (const t of o.tags || []) {
      tagCount.set(t, (tagCount.get(t) || 0) + 1)
    }
  }
  if (tagCount.size > 0) {
    console.log(`\nTAGS encontradas (${tagCount.size}):`)
    console.log('─'.repeat(70))
    const sortedTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1])
    for (const [tag, n] of sortedTags.slice(0, 50)) {
      console.log(`  ${String(n).padStart(4)}× ${tag}`)
    }
    if (sortedTags.length > 50) {
      console.log(`  ... y ${sortedTags.length - 50} tags más`)
    }
  } else {
    console.log('\nTAGS: ninguna devuelta por la API de oportunidades.')
    console.log('  (Las tags pueden estar en el contact, no en la opportunity — habría que pegar a /contacts.)')
  }

  // Muestras
  console.log(`\nMUESTRAS — primeras 3 oportunidades (JSON crudo):`)
  console.log('─'.repeat(70))
  for (const o of opps.slice(0, 3)) {
    console.log(JSON.stringify(o, null, 2).split('\n').map(l => '  ' + l).join('\n'))
    console.log('  ' + '─'.repeat(50))
  }

  // Resumen útil
  console.log('\nRESUMEN PARA MAPEO:')
  console.log('─'.repeat(70))
  console.log(`  • ${opps.length} oportunidades a importar`)
  console.log(`  • ${p.stages.length} stages, posibles candidatos a omitir:`)
  for (const s of sortedStages) {
    const n = stageCount.get(s.id) || 0
    const probablyOmit = /^llamada\s*\d/i.test(s.name) || /^call\s*\d/i.test(s.name)
    console.log(`      ${probablyOmit ? '⚠ ' : '  '}${s.name} (${n})`)
  }
  console.log(`  • ${cfCount.size} custom fields distintos`)
  console.log(`  • ${tagCount.size} tags distintas en opps`)
}

async function fetchContact(contactId: string): Promise<Record<string, unknown> | null> {
  const url = `${GHL_API_BASE}/contacts/${contactId}`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    console.error(`  ⚠ contact ${contactId}: HTTP ${res.status}`)
    return null
  }
  const json = await res.json()
  return json.contact || json
}

async function fetchGlobalCustomFields(): Promise<Array<Record<string, unknown>>> {
  const url = `${GHL_API_BASE}/locations/${locationId()}/customFields`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    console.error(`  ⚠ customFields global: HTTP ${res.status}`)
    return []
  }
  const json = await res.json()
  return json.customFields || []
}

async function inspectCaptadas(pipeline: Pipeline) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`CONTACTS DE OPORTUNIDADES "CAPTADA"`)
  console.log(`${'═'.repeat(70)}`)

  const captadaStage = pipeline.stages.find(s => /captad/i.test(s.name) && !/seguimiento/i.test(s.name))
  if (!captadaStage) {
    console.log('No encontré el stage "Captada" — saltando.')
    return
  }
  console.log(`Stage target: "${captadaStage.name}" (${captadaStage.id})\n`)

  const allOpps = await fetchAllOpportunities(pipeline.id)
  const captadas = allOpps.filter(o => o.pipelineStageId === captadaStage.id)
  console.log(`${captadas.length} oportunidades en este stage.\n`)

  for (const opp of captadas) {
    console.log('─'.repeat(70))
    console.log(`OPP: ${opp.name} (${opp.id})`)
    console.log(`  Source: ${opp.source || '—'}`)
    console.log(`  Created: ${opp.createdAt}`)
    console.log(`  Contact: ${opp.contact?.name} / ${opp.contact?.email} / ${opp.contact?.phone}`)
    console.log(`  Tags: ${JSON.stringify(opp.contact?.tags || [])}`)

    const contactId = (opp as unknown as { contactId?: string }).contactId
    if (!contactId) {
      console.log('  ⚠ Sin contactId — no se puede fetch contact completo')
      continue
    }
    const full = await fetchContact(contactId)
    if (!full) continue

    // Mostrar customFields del contact
    const cf = (full.customFields || full.customField || []) as Array<Record<string, unknown>>
    console.log(`  CONTACT custom fields (${cf.length}):`)
    for (const f of cf) {
      const key = f.fieldKey || f.key || f.id
      const val = f.value ?? f.field_value
      const valStr = typeof val === 'string' ? val.substring(0, 80) : JSON.stringify(val).substring(0, 80)
      console.log(`    • ${key}: ${valStr}`)
    }
    // Algunos campos top-level útiles
    const topLevel = ['firstName', 'lastName', 'name', 'address1', 'city', 'state', 'country', 'postalCode', 'dnd', 'source', 'companyName']
    console.log(`  CONTACT top-level útiles:`)
    for (const k of topLevel) {
      const v = (full as Record<string, unknown>)[k]
      if (v != null && v !== '') console.log(`    • ${k}: ${typeof v === 'string' ? v.substring(0, 80) : JSON.stringify(v)}`)
    }
  }
}

async function inspectGlobalCustomFields() {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`CUSTOM FIELDS GLOBALES DE LA LOCATION (definiciones)`)
  console.log(`${'═'.repeat(70)}\n`)
  const cf = await fetchGlobalCustomFields()
  console.log(`Total: ${cf.length}\n`)
  for (const f of cf) {
    const name = f.name || f.fieldKey || f.id
    const dataType = f.dataType || f.type || '?'
    const placeholder = f.placeholder || ''
    const model = f.model || '?'  // contact | opportunity
    console.log(`  [${model}] ${name}  (${dataType})  ${placeholder ? '— ' + placeholder : ''}`)
  }
}

async function main() {
  console.log('GHL DISCOVERY — read-only. No modifica Supabase ni GHL.\n')
  const pipelines = await fetchPipelines()
  console.log(`Pipelines totales en la cuenta: ${pipelines.length}`)
  for (const p of pipelines) {
    console.log(`  • ${p.name}  (${p.stages.length} stages)`)
  }

  if (INSPECT_GLOBAL_CF) {
    await inspectGlobalCustomFields()
  }

  if (ALL_PIPELINES) {
    for (const p of pipelines) await inspectPipeline(p)
    return
  }

  const target = pipelines.find(p => p.name === TARGET_PIPELINE_NAME)
  if (!target) {
    console.error(`\n❌ Pipeline "${TARGET_PIPELINE_NAME}" no encontrado.`)
    console.error('Pasale --pipeline "<nombre exacto>" o --all para inspeccionar todos.')
    process.exit(1)
  }

  if (INSPECT_CAPTADAS) {
    await inspectCaptadas(target)
    return
  }

  await inspectPipeline(target)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

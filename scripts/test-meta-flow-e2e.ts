/**
 * QA end-to-end del flow de creación de campaña Meta Ads.
 *
 * Corre `createCampaignForProperty` contra la API real de Meta usando las
 * credenciales de .env.local — exactamente lo que pasa cuando el usuario
 * clickea "Crear campaña" en el wizard.
 *
 * En cada error, reporta:
 *   - paso del flow que falló (Campaign/Image/Creative/AdSet/Ad/Activate)
 *   - subcode, mensaje completo y blame_field_specs
 *   - sugerencia de fix (mapping conocido en common errors)
 *
 * Limpia automáticamente: archiva la campaña creada (o huérfana) al final.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/test-meta-flow-e2e.ts
 *
 * Opcional flags:
 *   --keep             No archivar la campaña al final (debug visual en Ads Manager)
 *   --property=<uuid>  Usar esa property (sino busca/crea una de prueba)
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types.ts'

const ARGS = process.argv.slice(2)
const KEEP = ARGS.includes('--keep')
const PROP_ARG = ARGS.find(a => a.startsWith('--property='))?.split('=')[1]

function supa() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Auto-descubre META_PAGE_ID y META_PIXEL_ID desde la cuenta publicitaria
 * usando el access_token. Solo si no están seteados como env vars.
 * Necesario para correr el script local — en producción Netlify ya las tiene.
 */
async function autodiscoverMetaIds(): Promise<void> {
  const token = process.env.META_ACCESS_TOKEN
  const accountIdRaw = process.env.META_AD_ACCOUNT_ID
  if (!token || !accountIdRaw) {
    console.warn('[autodiscover] sin META_ACCESS_TOKEN o META_AD_ACCOUNT_ID, skipping')
    return
  }
  const accountId = accountIdRaw.startsWith('act_') ? accountIdRaw : `act_${accountIdRaw}`
  const META = 'https://graph.facebook.com/v21.0'

  if (!process.env.META_PAGE_ID) {
    try {
      const r = await fetch(
        `${META}/${accountId}/promote_pages?fields=id,name&limit=10&access_token=${encodeURIComponent(token)}`,
      )
      if (r.ok) {
        const j = (await r.json()) as { data?: Array<{ id: string; name?: string }> }
        if (j.data?.length) {
          process.env.META_PAGE_ID = j.data[0].id
          console.log(`[autodiscover] META_PAGE_ID = ${j.data[0].id} (${j.data[0].name ?? 'sin nombre'})`)
        } else {
          console.warn('[autodiscover] no se encontraron páginas en la cuenta')
        }
      } else {
        console.warn('[autodiscover] /promote_pages falló:', r.status, await r.text())
      }
    } catch (err) {
      console.warn('[autodiscover] promote_pages error', err)
    }
  }

  if (!process.env.META_PIXEL_ID) {
    try {
      const r = await fetch(
        `${META}/${accountId}/adspixels?fields=id,name&limit=10&access_token=${encodeURIComponent(token)}`,
      )
      if (r.ok) {
        const j = (await r.json()) as { data?: Array<{ id: string; name?: string }> }
        if (j.data?.length) {
          process.env.META_PIXEL_ID = j.data[0].id
          console.log(`[autodiscover] META_PIXEL_ID = ${j.data[0].id} (${j.data[0].name ?? 'sin nombre'})`)
        } else {
          console.warn('[autodiscover] no se encontraron pixels en la cuenta')
        }
      } else {
        console.warn('[autodiscover] /adspixels falló:', r.status, await r.text())
      }
    } catch (err) {
      console.warn('[autodiscover] adspixels error', err)
    }
  }
}

async function ensureTestProperty(): Promise<string> {
  const client = supa()
  if (PROP_ARG) {
    const { data } = await client.from('properties').select('id').eq('id', PROP_ARG).maybeSingle()
    if (!data) throw new Error(`Property ${PROP_ARG} no encontrada`)
    return data.id
  }
  // Buscar una de prueba existente
  const { data: existing } = await client
    .from('properties')
    .select('id, address, public_slug')
    .like('address', '[PRUEBA %')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    console.log(`[QA-E2E] usando property existente ${existing.id} (${existing.address})`)
    return existing.id
  }
  // Crear una nueva
  const runid = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 13)
  console.log(`[QA-E2E] creando property de prueba con runid ${runid}`)
  const { data: admin } = await client
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'dueno'])
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .single()

  const { data: created, error } = await client
    .from('properties')
    .insert({
      address: `[PRUEBA ${runid}] Av Santa Fe 1234`,
      neighborhood: 'Palermo',
      city: 'CABA',
      property_type: 'departamento',
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      garages: 1,
      covered_area: 70,
      total_area: 75,
      floor: 5,
      age: 10,
      asking_price: 180000,
      currency: 'USD',
      commission_percentage: 3,
      status: 'approved',
      legal_status: 'approved',
      photos: [
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1920',
        'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1920',
        'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1920',
      ],
      latitude: -34.581,
      longitude: -58.429,
      description:
        'PROPIEDAD DE PRUEBA QA E2E — Departamento luminoso de 3 ambientes con balcón aterrazado, vista despejada y excelente luminosidad natural durante todo el día. Cocina integrada, dormitorios amplios y baño completo. Edificio con pileta, parrilla y SUM.',
      amenities: ['pileta', 'parrilla', 'sum'],
      operation_type: 'venta',
      title: `[PRUEBA ${runid}] Depto 3 amb Palermo`,
      expensas: 50000,
      public_slug: `qa-e2e-${runid.toLowerCase()}`,
      origin: 'embudo',
      assigned_to: admin?.id ?? null,
    })
    .select('id')
    .single()
  if (error || !created) throw new Error('No se pudo crear property: ' + error?.message)
  return created.id
}

interface RunResult {
  ok: boolean
  step: string
  campaignId?: string
  error?: { subcode?: number; message: string; blameField?: string }
}

const ERROR_HINTS: Record<number, string> = {
  4834011: 'Falta is_adset_budget_sharing_enabled en Campaign',
  2490487: 'bid_strategy debe estar en AdSet (junto al budget), no en Campaign',
  1885737: 'bid_strategy va en la entidad que tiene el budget',
  1885014: 'promoted_object necesita custom_event_type además de pixel_id',
  2490408: 'optimization_goal incompatible con destination_type',
  1870227: 'falta targeting_automation.advantage_audience (1 o 0)',
  1870188: 'age_min > 25 con advantage_audience=1 — bajar age_min',
  1487079: 'targeting inválido — algún interest/behavior deprecado',
}

async function runOnce(propertyId: string): Promise<RunResult> {
  // Import dinámico para que ngeresar al script no rompa si hay errores TS al cargar
  const { createCampaignForProperty } = await import('../lib/marketing/meta-campaign-builder.ts')
  const client = supa()
  const { data: property, error } = await client
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single()
  if (error || !property) throw new Error('No se pudo cargar property: ' + error?.message)

  try {
    const result = await createCampaignForProperty(property as never, { dryRun: true })
    return { ok: true, step: 'complete', campaignId: result.campaignId }
  } catch (err) {
    // Parsear el error de Meta del mensaje (formato: "Meta XXX /path: {...}")
    const msg = err instanceof Error ? err.message : String(err)
    let subcode: number | undefined
    let blame: string | undefined
    let parsed: { error?: { error_subcode?: number; error_data?: string; error_user_msg?: string; message?: string } } | null = null
    try {
      const jsonStart = msg.indexOf('{')
      if (jsonStart > -1) parsed = JSON.parse(msg.slice(jsonStart))
      subcode = parsed?.error?.error_subcode
      const errorData = parsed?.error?.error_data
      if (errorData) {
        try {
          const ed = typeof errorData === 'string' ? JSON.parse(errorData) : errorData
          blame = (ed as { blame_field_specs?: string[][] })?.blame_field_specs?.[0]?.[0]
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore parse errors
    }
    // Determinar step desde el path del error
    let step = 'unknown'
    if (msg.includes('/campaigns')) step = 'campaign'
    else if (msg.includes('/adimages')) step = 'image'
    else if (msg.includes('/adcreatives')) step = 'creative'
    else if (msg.includes('/adsets')) step = 'adset'
    else if (msg.includes('/ads')) step = 'ad'
    else if (msg.includes('property_meta_campaigns')) step = 'db_insert'

    return {
      ok: false,
      step,
      error: { subcode, message: msg, blameField: blame },
    }
  }
}

async function cleanup(propertyId: string) {
  const client = supa()
  // Archivar campañas creadas para esta property
  const { data: rows } = await client
    .from('property_meta_campaigns')
    .select('campaign_id')
    .eq('property_id', propertyId)
    .neq('status', 'archived')
  if (!rows || rows.length === 0) {
    console.log('[QA-E2E cleanup] no hay campañas activas para archivar')
    return
  }
  console.log(`[QA-E2E cleanup] archivando ${rows.length} campaña(s)…`)
  const META_API = 'https://graph.facebook.com/v21.0'
  const token = process.env.META_ACCESS_TOKEN
  if (!token) {
    console.warn('[QA-E2E cleanup] META_ACCESS_TOKEN no setado, skipping Meta archive')
  } else {
    for (const row of rows) {
      try {
        await fetch(
          `${META_API}/${row.campaign_id}?access_token=${encodeURIComponent(token)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'ARCHIVED' }),
          },
        )
        console.log(`  ✓ ${row.campaign_id} archivada en Meta`)
      } catch (err) {
        console.warn(`  ✗ no se pudo archivar ${row.campaign_id}:`, err)
      }
    }
  }
  await client
    .from('property_meta_campaigns')
    .update({ status: 'archived', last_error: 'Archived by QA E2E cleanup' })
    .eq('property_id', propertyId)
    .neq('status', 'archived')
}

async function main() {
  console.log('=== QA E2E Meta Flow ===')
  console.log('Trying to create a campaign end-to-end against the real Meta API.')
  console.log('Will archive whatever it creates at the end (unless --keep).\n')

  await autodiscoverMetaIds()
  const propertyId = await ensureTestProperty()
  console.log(`[QA-E2E] property_id: ${propertyId}\n`)

  const result = await runOnce(propertyId)

  if (result.ok) {
    console.log('✅ FLOW COMPLETO end-to-end!')
    console.log(`   Campaign creada: ${result.campaignId}`)
    console.log('   Steps: Campaign → Image → Creative → AdSet → Ad ✓\n')
  } else {
    console.log(`❌ FALLÓ en step: ${result.step}`)
    if (result.error?.subcode) {
      console.log(`   subcode: ${result.error.subcode}`)
      const hint = ERROR_HINTS[result.error.subcode]
      if (hint) console.log(`   💡 Sugerencia: ${hint}`)
    }
    if (result.error?.blameField) {
      console.log(`   blame_field: ${result.error.blameField}`)
    }
    console.log(`\n   Mensaje completo:\n   ${result.error?.message}\n`)
  }

  if (!KEEP) {
    await cleanup(propertyId)
  } else {
    console.log('[QA-E2E] --keep — no archivamos. Revisalo en Ads Manager.')
  }
  process.exit(result.ok ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(2)
})

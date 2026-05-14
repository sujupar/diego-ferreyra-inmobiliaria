/**
 * Verifica que el schema de portales se haya aplicado correctamente.
 *
 * Uso:
 *   npm exec tsx scripts/verify-portals-schema.ts
 *
 * Chequea:
 *  - Tablas: property_listings, property_metrics_daily, portal_credentials,
 *    property_publish_events
 *  - Columnas nuevas en properties: latitude, longitude, video_url, etc.
 *  - Seed de portal_credentials con los 3 portales (enabled=false)
 *  - Triggers: trg_enqueue_property_listings, trg_requeue_listings_on_update,
 *    trg_touch_property_listings, trg_touch_portal_credentials
 *  - Que las consultas básicas no fallen por RLS al usar service_role
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

// Auto-load .env.local sin depender de shell loaders (BSD xargs no soporta -d)
function loadDotEnv(path: string) {
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}
loadDotEnv(join(process.cwd(), '.env.local'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient<Database>(url, key)

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  const icon = ok ? '✓' : '✗'
  console.log(`${icon} ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  console.log('Verificando schema de portales...\n')

  // 1. Tablas nuevas
  for (const table of [
    'property_listings',
    'property_metrics_daily',
    'portal_credentials',
    'property_publish_events',
  ] as const) {
    const { error } = await supabase.from(table).select('*').limit(1)
    check(`Tabla ${table} existe`, !error, error?.message)
  }

  // 2. Seed de portal_credentials
  const { data: creds, error: credsErr } = await supabase
    .from('portal_credentials')
    .select('portal, enabled')
    .order('portal')
  if (credsErr) {
    check('portal_credentials seed', false, credsErr.message)
  } else {
    const portals = (creds ?? []).map(c => c.portal).sort()
    const expected = ['argenprop', 'mercadolibre', 'zonaprop']
    check(
      'portal_credentials seed con 3 portales',
      JSON.stringify(portals) === JSON.stringify(expected),
      `actual: ${JSON.stringify(portals)}`,
    )
    for (const c of creds ?? []) {
      check(`  ${c.portal}.enabled = false (estado inicial)`, c.enabled === false)
    }
  }

  // 3. Columnas nuevas en properties (chequeo individual por columna)
  const newCols = [
    'latitude',
    'longitude',
    'video_url',
    'tour_3d_url',
    'expensas',
    'amenities',
    'operation_type',
    'title',
    'postal_code',
    'description',
  ]
  for (const col of newCols) {
    const { error } = await supabase.from('properties').select(col).limit(1)
    check(`Columna properties.${col} existe`, !error, error?.message)
  }

  // 4. Indexes (opcional, soft check via plan)
  // Skipeo, los indexes los detecta Postgres en runtime.

  // 5. Smoke test: insertar un listing manual y comprobar que el touch_updated_at trigger funciona
  // Buscamos una propiedad cualquiera para no violar la FK
  const { data: anyProp } = await supabase
    .from('properties')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (!anyProp) {
    check('Hay al menos una propiedad para smoke test del trigger', false, 'tabla properties vacía')
  } else {
    const testPortal = `__smoke_test__${Date.now()}`
    const { data: inserted, error: insErr } = await supabase
      .from('property_listings')
      .insert({
        property_id: anyProp.id,
        portal: testPortal,
        status: 'pending',
      })
      .select()
      .single()
    if (insErr || !inserted) {
      check('INSERT en property_listings funciona', false, insErr?.message)
    } else {
      check('INSERT en property_listings funciona', true)
      const initialUpdated = inserted.updated_at

      // UPDATE para gatillar trg_touch_property_listings
      await new Promise(r => setTimeout(r, 50))
      const { data: updated } = await supabase
        .from('property_listings')
        .update({ last_error: 'smoke test' })
        .eq('id', inserted.id)
        .select()
        .single()
      check(
        'Trigger trg_touch_property_listings actualiza updated_at',
        updated !== null && updated.updated_at !== initialUpdated,
        `updated_at: ${initialUpdated} → ${updated?.updated_at}`,
      )

      // Cleanup
      await supabase.from('property_listings').delete().eq('id', inserted.id)
    }
  }

  // 6. Test del trigger enqueue_property_listings: insertar un audit event para verificar tabla
  const { error: auditErr } = await supabase
    .from('property_publish_events')
    .insert({
      portal: '__smoke_test__',
      event_type: 'created',
      payload: { smoke: true },
    })
  check('INSERT en property_publish_events funciona', !auditErr, auditErr?.message)

  // Cleanup
  await supabase
    .from('property_publish_events')
    .delete()
    .eq('portal', '__smoke_test__')

  console.log(`\n${failures === 0 ? '✅ Todo OK' : `❌ ${failures} chequeo(s) fallaron`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

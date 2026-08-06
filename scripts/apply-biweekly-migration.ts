#!/usr/bin/env tsx
/**
 * Aplica la migración 20260528000001_report_settings_biweekly.sql.
 *
 * Se ejecuta vía SQL directo porque la CLI de Supabase no conecta.
 * Usa service-role key. Es idempotente.
 */
import { createClient } from '@supabase/supabase-js'
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // 1. Verificar si la columna ya existe
  const { data: existing, error: testErr } = await supabase
    .from('report_settings')
    .select('id, biweekly_enabled')
    .eq('id', 'default')
    .single()

  if (testErr && !testErr.message.includes('biweekly_enabled')) {
    throw new Error(`No pude leer report_settings: ${testErr.message}`)
  }

  if (!testErr) {
    console.log('Columna biweekly_enabled ya existe. Valor actual:', existing?.biweekly_enabled)
  } else {
    console.log('Columna biweekly_enabled no existe — hay que correr la migración manualmente.')
    console.log('')
    console.log('SQL a correr en el SQL Editor de Supabase Dashboard:')
    console.log('────────────────────────────────────────────────────')
    const sql = fs.readFileSync(
      path.resolve('supabase/migrations/20260528000001_report_settings_biweekly.sql'),
      'utf-8'
    )
    console.log(sql)
    console.log('────────────────────────────────────────────────────')
    return
  }

  // 2. Asegurar que la fila default tenga biweekly_enabled = true
  if (!existing?.biweekly_enabled) {
    console.log('Activando biweekly_enabled en la fila default...')
    const { error: updErr } = await supabase
      .from('report_settings')
      .update({ biweekly_enabled: true })
      .eq('id', 'default')
    if (updErr) throw new Error(`Update falló: ${updErr.message}`)
    console.log('OK — biweekly_enabled activado.')
  } else {
    console.log('biweekly_enabled ya está en true. Nada que hacer.')
  }

  // 3. Confirmar estado final
  const { data: final } = await supabase
    .from('report_settings')
    .select('*')
    .eq('id', 'default')
    .single()
  console.log('\nEstado final de report_settings:')
  console.log(JSON.stringify(final, null, 2))
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})

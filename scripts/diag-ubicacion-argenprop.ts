/**
 * Diagnóstico de SOLO LECTURA: ¿por qué esta ficha no publica en Argenprop?
 * Muestra la ubicación guardada, si está vinculada al catálogo y qué resuelve
 * el adapter. NO publica ni escribe nada.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/diag-ubicacion-argenprop.ts <propertyId>
 */
import { createClient } from '@supabase/supabase-js'
import { resolveCredentials } from '../lib/portals/credentials'
import { ArgenpropAdapter } from '../lib/portals/argenprop/adapter'
import { leerRefArgenprop } from '../lib/properties/location-selection'

async function main() {
  const ID = process.argv[2]
  if (!ID) { console.error('Falta el id de la propiedad.'); process.exit(1) }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: p, error } = await sb.from('properties').select('*').eq('id', ID).single()
  if (error || !p) { console.error('No encontré la propiedad:', error?.message); process.exit(1) }

  console.log(`\nFicha: ${p.address}`)
  console.log(`  barrio="${p.neighborhood}"  localidad="${p.city}"  provincia=${p.province ?? 'SIN CARGAR'}`)
  const ref = leerRefArgenprop(p.location_refs)
  console.log(`  vinculada al catálogo: ${ref ? `SÍ → ${ref.localidadId}${ref.barrioId ? ` / ${ref.barrioId}` : ' (sin barrio)'}` : 'NO (se resolverá por nombres)'}`)

  const creds = await resolveCredentials('argenprop', { env: process.env, supabase: sb as never })
  if (!creds.ap?.tokenCrm) { console.error('\nFaltan credenciales de Argenprop en el entorno.'); process.exit(1) }
  const ap = new ArgenpropAdapter(creds.enabled, creds.ap)

  const v = ap.validate(p as never)
  console.log(`\nValidación general: ${v.ok ? 'OK' : 'CON ERRORES'}`)
  for (const e of v.errors) console.log(`  ✗ ${e}`)
  for (const w of v.warnings) console.log(`  · ${w}`)

  try {
    const r = await (ap as unknown as { resolveLocalizacion(x: unknown): Promise<{ localidadId: string; barrioId: string | null }> })
      .resolveLocalizacion(p)
    console.log(`\nUbicación que recibiría Argenprop: ${r.localidadId}${r.barrioId ? ` / ${r.barrioId}` : ' (sin barrio)'}`)
  } catch (e) {
    console.log(`\nArgenprop la rechazaría: ${e instanceof Error ? e.message : e}`)
  }

}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

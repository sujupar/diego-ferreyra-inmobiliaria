/**
 * Verifica SOLO LECTURA que la landing pública muestra el precio que hay HOY en
 * la base — es decir, que editar el precio en la ficha se refleja en la landing
 * sin regenerar nada.
 *
 * Por qué funciona sin trabajo extra: los bloques de la landing leen el precio
 * en vivo desde `properties` (`lib/landing/registry.tsx`), nunca desde el
 * documento guardado (`asking_price` no existe en `lib/landing/schema.ts`), y
 * la página se sirve sin caché (`cache-control: no-store`).
 *
 * Uso: node --env-file=.env.local --import tsx scripts/verify-precio-landing.ts
 */
import { createClient } from '@supabase/supabase-js'

const SITIO = process.env.NEXT_PUBLIC_FUNNEL_PUBLIC_URL ?? 'https://inmobiliariadiegoferreyra.com'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** El precio se renderiza con separador de miles es-AR: 1350000 → "1.350.000". */
function conSeparadores(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
}

async function main() {
  const { data, error } = await sb()
    .from('properties')
    .select('id, address, asking_price, currency, public_slug')
    .not('public_slug', 'is', null)
    .eq('status', 'approved')
  if (error) { console.error('No se pudieron leer las propiedades:', error.message); process.exit(1) }

  let fallas = 0
  let revisadas = 0

  for (const p of data ?? []) {
    const { data: landing } = await sb()
      .from('property_landings').select('status').eq('property_id', p.id).maybeSingle()
    if (landing?.status !== 'published') continue

    revisadas++
    const url = `${SITIO}/p/${p.public_slug}`
    const res = await fetch(url)
    if (!res.ok) {
      fallas++
      console.log(`✘ ${p.address} — la landing respondió ${res.status}`)
      continue
    }
    const sinCache = /no-store/i.test(res.headers.get('cache-control') ?? '')
    const html = await res.text()
    const esperado = conSeparadores(p.asking_price as number)

    if (!html.includes(esperado)) {
      fallas++
      console.log(`✘ ${p.address} — la base dice ${p.currency} ${esperado} pero la landing no lo muestra`)
      console.log(`    ${url}`)
      continue
    }
    console.log(`✔ ${p.address} — ${p.currency} ${esperado} en base y en la landing${sinCache ? ' · sin caché' : ' · OJO: la respuesta trae caché'}`)
  }

  if (revisadas === 0) { console.log('\n(no hay landings publicadas para verificar)'); return }
  if (fallas > 0) { console.log(`\n❌ ${fallas} de ${revisadas} no coinciden`); process.exit(1) }
  console.log(`\n✅ las ${revisadas} landings publicadas muestran el precio vigente de la base`)
}

main()

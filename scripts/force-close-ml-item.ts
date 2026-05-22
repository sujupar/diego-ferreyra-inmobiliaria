/**
 * One-shot: cierra un item de MercadoLibre que quedó colgado por el bug del
 * pipeline-test (Item created en not_yet_active, no se pudo pausar).
 *
 * Uso: node --env-file=.env.local --import tsx scripts/force-close-ml-item.ts <ITEM_ID>
 *
 * Estrategia:
 *   1. GET item → ver estado actual
 *   2. Si paused/closed: nada que hacer
 *   3. Si active: PUT status: closed
 *   4. Si not_yet_active:
 *        a. PUT status: active (única transición permitida)
 *        b. wait 3s
 *        c. PUT status: closed
 *      Ventana de exposición pública: ~3s.
 */
import { createClient } from '@supabase/supabase-js'

const ML_BASE = 'https://api.mercadolibre.com'
const itemId = process.argv[2]

if (!itemId) {
  console.error('Uso: npx tsx scripts/force-close-ml-item.ts <ITEM_ID>')
  process.exit(1)
}

async function getAccessToken(): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase
    .from('portal_credentials')
    .select('access_token, refresh_token, expires_at')
    .eq('portal', 'mercadolibre')
    .maybeSingle()
  if (error || !data) throw new Error('No ML credentials en DB: ' + (error?.message ?? 'no row'))
  if (!data.access_token) throw new Error('access_token vacío')

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  const expiresSoon = expiresAt - Date.now() < 60 * 60 * 1000
  if (!expiresSoon) return data.access_token

  // Refresh
  console.log('Token expira pronto, refrescando…')
  const res = await fetch(`${ML_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_APP_ID!,
      client_secret: process.env.ML_SECRET_KEY!,
      refresh_token: data.refresh_token!,
    }),
  })
  if (!res.ok) throw new Error('Refresh falló: ' + (await res.text()))
  const fresh = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }

  await supabase
    .from('portal_credentials')
    .update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
    })
    .eq('portal', 'mercadolibre')
  return fresh.access_token
}

async function ml(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${ML_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { ok: res.ok, status: res.status, body: parsed }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log(`\n=== Force-close ML item: ${itemId} ===\n`)
  const token = await getAccessToken()

  console.log('1. GET item para ver estado actual…')
  const r1 = await ml('GET', `/items/${itemId}`, token)
  if (!r1.ok) {
    console.error(`   ❌ GET falló (${r1.status}):`, r1.body)
    process.exit(1)
  }
  const item = r1.body as { status: string; title?: string; permalink?: string }
  console.log(`   Estado actual: ${item.status}`)
  console.log(`   Título: ${item.title}`)
  console.log(`   Permalink: ${item.permalink}\n`)

  if (item.status === 'closed') {
    console.log('✅ Item ya está cerrado. Nada que hacer.')
    return
  }
  if (item.status === 'paused') {
    console.log('   Item está paused → ahora lo cierro para no dejarlo en limbo.')
    const r = await ml('PUT', `/items/${itemId}`, token, { status: 'closed' })
    if (!r.ok) {
      console.error('   ❌ Falló close:', r.body)
      process.exit(1)
    }
    console.log('   ✅ Cerrado.')
    return
  }
  if (item.status === 'active') {
    console.log('2. Item active → PUT status: closed')
    const r = await ml('PUT', `/items/${itemId}`, token, { status: 'closed' })
    if (!r.ok) {
      console.error('   ❌ Falló close:', r.body)
      process.exit(1)
    }
    console.log('   ✅ Cerrado.')
    return
  }
  if (item.status === 'not_yet_active') {
    console.log('2. Item not_yet_active → estrategia: activar y luego cerrar')
    console.log('   2.a PUT status: active')
    const r1b = await ml('PUT', `/items/${itemId}`, token, { status: 'active' })
    if (!r1b.ok) {
      console.error('   ❌ Falló activación:', r1b.body)
      console.log('\n   Probable causa: item.attributes inválidos. Vamos a intentar cerrar directo igual:')
      const r1c = await ml('PUT', `/items/${itemId}`, token, { status: 'closed' })
      console.log('   Intento de close directo:', r1c.status, r1c.body)
      process.exit(1)
    }
    console.log('   ✅ Activado.')
    console.log('   2.b Esperando 3s para que ML estabilice el estado…')
    await sleep(3000)
    console.log('   2.c PUT status: closed')
    const r2 = await ml('PUT', `/items/${itemId}`, token, { status: 'closed' })
    if (!r2.ok) {
      console.error('   ❌ Falló close post-active:', r2.body)
      console.log('   ⚠️  El item quedó ACTIVE (público). Intentá pausarlo manualmente desde el panel ML.')
      process.exit(1)
    }
    console.log('   ✅ Cerrado.')
    console.log('\n   Ventana de exposición pública: ~3 segundos.')
    return
  }
  console.log(`⚠️  Estado inesperado: ${item.status}. Pegá la respuesta en chat para que la analice.`)
  console.log('Body completo:', JSON.stringify(item, null, 2))
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

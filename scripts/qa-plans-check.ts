// QA end-to-end del feature Planos (post-migración 20260718000001).
// Correr: node --env-file=.env.local --import tsx scripts/qa-plans-check.ts
//
// 1. Verifica que la columna properties.plans existe.
// 2. Crea una propiedad [TEST en pending_docs SIN fotos/lat-lng (no dispara
//    el trigger de campaña Meta ni el worker de portales).
// 3. Roundtrip de Storage con el MISMO path shape que la route upload-init:
//    createSignedUploadUrl → PUT → GET publicUrl → 200.
// 4. Escribe plans=[url], lee de vuelta, verifica etiqueta legible.
// 5. Teardown: borra el objeto de Storage y la propiedad [TEST.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { planLabelFromUrl, sanitizeFileBase } from '../lib/properties/media'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, '')
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function fail(msg: string): never {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

async function main() {
  // 1. Columna existe
  const colCheck = await admin.from('properties').select('id, plans').limit(1)
  if (colCheck.error) fail(`Columna plans: ${colCheck.error.message}`)
  console.log('✅ 1/5 Columna properties.plans existe')

  // 2. Propiedad [TEST mínima (sin fotos, sin lat/lng, pending_docs)
  const ins = await admin.from('properties').insert({
    address: '[TEST QA PLANOS — borrar]',
    neighborhood: 'QA',
    city: 'CABA',
    property_type: 'departamento',
    asking_price: 1,
    currency: 'USD',
    status: 'pending_docs',
  }).select('id').single()
  if (ins.error) fail(`INSERT [TEST: ${ins.error.message}`)
  const propId = ins.data.id as string
  console.log(`✅ 2/5 Propiedad [TEST creada: ${propId}`)

  const bucket = admin.storage.from('property-files')
  const path = `properties/${propId}/plans/${randomUUID()}-${sanitizeFileBase('Plano Cocina QA.pdf')}.pdf`
  let storagePathToClean: string | null = null

  try {
    // 3. Storage roundtrip (mismo shape que upload-init kind:'plan')
    const signed = await bucket.createSignedUploadUrl(path)
    if (signed.error || !signed.data) fail(`signedUploadUrl: ${signed.error?.message}`)
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
    const putRes = await fetch(signed.data.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
        ...(signed.data.token ? { Authorization: `Bearer ${signed.data.token}` } : {}),
      },
      body: pdfBytes,
    })
    if (!putRes.ok) fail(`PUT a signedUrl: HTTP ${putRes.status}`)
    storagePathToClean = path
    const { data: { publicUrl } } = bucket.getPublicUrl(path)
    const getRes = await fetch(publicUrl)
    if (!getRes.ok) fail(`GET publicUrl: HTTP ${getRes.status}`)
    console.log('✅ 3/5 Storage roundtrip OK (signed PUT + public GET)')

    // 4. Escribir y leer plans + etiqueta legible
    const upd = await admin.from('properties').update({ plans: [publicUrl] }).eq('id', propId)
    if (upd.error) fail(`UPDATE plans: ${upd.error.message}`)
    const read = await admin.from('properties').select('plans').eq('id', propId).single()
    if (read.error || !Array.isArray(read.data?.plans) || read.data.plans[0] !== publicUrl) {
      fail(`Lectura de plans no coincide: ${JSON.stringify(read.data)}`)
    }
    const label = planLabelFromUrl(publicUrl)
    if (label !== 'plano-cocina-qa.pdf') fail(`Etiqueta inesperada: "${label}"`)
    console.log(`✅ 4/5 plans[] escribe/lee OK — etiqueta: "${label}"`)
  } finally {
    // 5. Teardown (solo lo creado por este script)
    if (storagePathToClean) {
      const rm = await bucket.remove([storagePathToClean])
      if (rm.error) console.error(`⚠️ No se pudo borrar de Storage: ${rm.error.message}`)
    }
    const del = await admin.from('properties').delete().eq('id', propId).like('address', '[TEST QA PLANOS%')
    if (del.error) console.error(`⚠️ No se pudo borrar la propiedad [TEST ${propId}: ${del.error.message}`)
    else console.log('✅ 5/5 Teardown OK (objeto de Storage + propiedad [TEST borrados)')
  }

  console.log('\n🎉 QA Planos: TODO OK')
}

main().catch(e => fail(e instanceof Error ? e.message : String(e)))

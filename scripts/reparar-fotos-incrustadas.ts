/**
 * Repara las propiedades que tienen fotos INCRUSTADAS (data:image/...;base64)
 * en `properties.photos`: sube cada una a Storage y deja la URL pública en el
 * mismo lugar del array. No borra nada: la imagen sigue existiendo, ahora como
 * archivo.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/reparar-fotos-incrustadas.ts [--commit] [--id <uuid>]
 *   sin --commit → solo informa qué haría.
 *   --commit     → escribe. Imprime el array ORIGINAL de cada propiedad antes de tocarla.
 *
 * Contexto: Av. Hipólito Yrigoyen 1550 (2026-09-14) tenía una captura de 4,4 MB
 * en base64 heredada de la tasación → ML 413 / Argenprop "Multimedia.Url".
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import { materializarFotosIncrustadas, subidorStorage } from '../lib/properties/materializar-fotos'
import { esFotoIncrustada } from '../lib/properties/fotos-incrustadas'

const commit = process.argv.includes('--commit')
const idArg = process.argv.indexOf('--id')
const soloId = idArg >= 0 ? process.argv[idArg + 1] : null

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let q = sb.from('properties').select('id, address, status, photos').neq('status', 'descartada')
  if (soloId) q = q.eq('id', soloId)
  const { data, error } = await q
  if (error) throw error

  const afectadas = (data ?? []).filter(p => (p.photos ?? []).some((f: unknown) => esFotoIncrustada(f)))
  console.log(`${afectadas.length} propiedad(es) con fotos incrustadas de ${data?.length ?? 0} revisadas ${commit ? '(MODO ESCRITURA)' : '(solo informe)'}`)

  for (const p of afectadas) {
    const fotos = (p.photos ?? []) as string[]
    const resumen = fotos.map((f, i) => `[${i}] ${esFotoIncrustada(f) ? `INCRUSTADA ${(f.length / 1e6).toFixed(1)} MB (${f.slice(5, 14)})` : f.slice(0, 90)}`)
    console.log(`\n— ${p.address} (${p.id}, ${p.status}) — ${fotos.length} fotos`)
    console.log(resumen.join('\n'))
    if (!commit) continue

    // Respaldo en el log: si algo saliera mal, el array original queda impreso.
    console.log('ORIGINAL (para restaurar a mano si hiciera falta):', JSON.stringify(fotos.map(f => (esFotoIncrustada(f) ? `${f.slice(0, 60)}…(${f.length} chars)` : f))))
    const r = await materializarFotosIncrustadas(p.id, fotos, subidorStorage(sb.storage))
    const { error: errUpd } = await sb.from('properties').update({ photos: r.photos }).eq('id', p.id)
    if (errUpd) throw errUpd
    console.log(`✓ ${p.address}: ${r.subidas} subida(s), ${r.descartadas} descartada(s) → ${r.photos.length} fotos`)
    r.photos.forEach((f, i) => console.log(`   [${i}] ${f}`))
  }

  // Verificación final (criterio 17 del spec).
  const { data: check } = await sb.from('properties').select('id, photos').neq('status', 'descartada')
  const quedan = (check ?? []).filter(p => (p.photos ?? []).some((f: unknown) => esFotoIncrustada(f))).length
  console.log(`\nPropiedades activas que TODAVÍA tienen fotos incrustadas: ${quedan}`)
}

main().catch(e => { console.error(e); process.exit(1) })

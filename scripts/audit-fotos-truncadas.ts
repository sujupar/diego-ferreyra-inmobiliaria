/**
 * Auditoría SOLO LECTURA: propiedades cuyas fotos en Storage superan a las de
 * la ficha (properties.photos).
 *
 * Contexto: hasta el 2026-08-06 el wizard de ML persistía slice(0, 12) sobre
 * properties.photos. Las fotos truncadas NO se borraron de Storage — siguen en
 * `property-files/properties/{id}/photos/` — solo desaparecieron del array.
 * Este script las encuentra y reporta. NO repara nada: algunas diferencias
 * pueden ser borrados a propósito ({deletePhoto} del módulo de media), así que
 * la decisión de restaurar es humana, propiedad por propiedad.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/audit-fotos-truncadas.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const BUCKET = 'property-files' // el de upload-init/commit

async function main() {
  const { data: props, error } = await supabase
    .from('properties')
    .select('id, address, photos, status')
    .neq('status', 'descartada')
    .order('created_at', { ascending: true })
  if (error) { console.error('No se pudieron leer las propiedades:', error.message); process.exit(1) }

  let afectadas = 0
  for (const p of props ?? []) {
    const enFicha = ((p.photos as string[] | null) ?? []).length
    const { data: archivos, error: e } = await supabase.storage
      .from(BUCKET)
      .list(`properties/${p.id}/photos`, { limit: 1000 })
    if (e) { console.log(`? ${p.address} — no se pudo listar Storage: ${e.message}`); continue }
    const enStorage = (archivos ?? []).filter(a => a.name && !a.name.startsWith('.')).length
    if (enStorage > enFicha) {
      afectadas++
      console.log(`✘ ${p.address}`)
      console.log(`    ficha: ${enFicha} fotos · Storage: ${enStorage} archivos · diferencia: ${enStorage - enFicha}`)
    }
  }

  console.log(`\n${afectadas === 0
    ? '✅ ninguna propiedad tiene más fotos en Storage que en la ficha'
    : `⚠️ ${afectadas} propiedad(es) con fotos en Storage que no están en la ficha (candidatas al truncado del wizard o borradas a propósito — revisar a mano)`}`)
}

main()

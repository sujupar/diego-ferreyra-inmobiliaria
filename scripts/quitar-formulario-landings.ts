/**
 * Saca el formulario DENTRO de la página de las landings guardadas (2026-11-18).
 *
 * Reemplaza cada bloque `lead_form` por el botón que abre el popup, en `content`
 * y en `draft_content` (si quedara en el borrador, publicar lo traería de vuelta).
 * No cambia la plantilla ni ningún otro bloque.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/quitar-formulario-landings.ts            # prueba: muestra, no escribe
 *   node --env-file=.env.local --import tsx scripts/quitar-formulario-landings.ts --commit   # escribe
 *
 * Antes de escribir guarda una copia de cada fila en `scripts/backups/`. Cada fila
 * va en su propia transacción y se aborta si el documento resultante no valida.
 * Idempotente: correrlo de nuevo no encuentra nada que cambiar.
 */
import { Client } from 'pg'
import { mkdirSync, writeFileSync } from 'node:fs'
import { quitarFormulario } from '../lib/landing/sin-formulario'
import { safeParseLandingDocument, type LandingDocument } from '../lib/landing/schema'

const COMMIT = process.argv.includes('--commit')

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const { rows } = await c.query(`
    select l.id, l.property_id, l.status, l.template_id, l.content, l.draft_content, p.public_slug
    from property_landings l join properties p on p.id = l.property_id
    where l.content::text like '%"lead_form"%' or coalesce(l.draft_content::text, '') like '%"lead_form"%'`)

  console.log(`${rows.length} landing(s) con formulario en la página. Modo: ${COMMIT ? 'ESCRIBIR' : 'prueba'}`)
  if (rows.length === 0) return void (await c.end())

  if (COMMIT) {
    mkdirSync('scripts/backups', { recursive: true })
    const f = `scripts/backups/landings-con-formulario-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    writeFileSync(f, JSON.stringify(rows, null, 1))
    console.log(`Copia guardada en ${f}`)
  }

  for (const r of rows) {
    const content = quitarFormulario(r.content as LandingDocument)
    const draft = r.draft_content ? quitarFormulario(r.draft_content as LandingDocument) : null
    const tipos = content.doc.blocks.map(b => b.type).join(', ')
    console.log(`- ${r.public_slug} [${r.status}, ${r.template_id}] content:${content.cambios} draft:${draft?.cambios ?? '—'} → ${tipos}`)
    if (!safeParseLandingDocument(content.doc) || (draft && !safeParseLandingDocument(draft.doc))) {
      throw new Error(`El documento de ${r.public_slug} no valida después del cambio: no se escribe nada de esta fila.`)
    }
    if (!COMMIT) continue
    await c.query('begin')
    try {
      await c.query('update property_landings set content = $2, draft_content = $3 where id = $1', [
        r.id, content.doc, draft ? draft.doc : r.draft_content,
      ])
      await c.query('commit')
    } catch (e) {
      await c.query('rollback')
      throw e
    }
  }
  await c.end()
}

main().catch(e => { console.error('ABORTADO:', e instanceof Error ? e.message : e); process.exit(1) })

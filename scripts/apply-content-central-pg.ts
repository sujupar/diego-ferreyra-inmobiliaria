/**
 * Aplica la migración 20260815000001_content_central.sql y siembra la Central
 * de Contenido: 147 ideas del banco de Diego, 20 piezas del bloque 1 (18–29 ago),
 * 19 formatos y 3 correcciones. ABORTA si los conteos no cuadran.
 *
 * Idempotente sobre el seed: si content_ideas ya tiene filas, NO re-siembra
 * (evita duplicar el banco si se corre dos veces).
 *
 * Correr: npx tsx --env-file=.env.local scripts/apply-content-central-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const SEED = JSON.parse(readFileSync('scripts/seed-content-central.json', 'utf8'))

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const sql = readFileSync('supabase/migrations/20260815000001_content_central.sql', 'utf8')
  await c.query(sql)
  console.log('✓ migración aplicada')

  const { rows: [{ n: yaHay }] } = await c.query(`SELECT count(*)::int AS n FROM content_ideas`)
  if (yaHay > 0) {
    console.log(`content_ideas ya tiene ${yaHay} filas — seed omitido (idempotencia).`)
  } else {
    await c.query('BEGIN')
    try {
      for (const i of SEED.ideas) {
        await c.query(
          `INSERT INTO content_ideas (categoria, subcategoria, titular, enfoque, formato, recurso, prioridad, origen, fuente, refrescar)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [i.categoria, i.subcategoria, i.titular, i.enfoque, i.formato, i.recurso, i.prioridad, i.origen, i.fuente, i.refrescar],
        )
      }
      for (const f of SEED.formatos) {
        await c.query(
          `INSERT INTO content_formats (nombre, descripcion, cuando_usar, diego_ya_lo_hizo, referencias)
           VALUES ($1,$2,$3,$4,$5)`,
          [f.nombre, f.descripcion, f.cuando_usar, f.diego_ya_lo_hizo, JSON.stringify(f.referencias)],
        )
      }
      for (const p of SEED.piezas) {
        await c.query(
          `INSERT INTO content_pieces (publish_date, slot, categoria, subcategoria, titular, enfoque, formato, recurso, notas, refrescar)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [p.publish_date, p.slot, p.categoria, p.subcategoria, p.titular, p.enfoque, p.formato, p.recurso, p.notas, p.refrescar],
        )
      }
      for (const co of SEED.correcciones) {
        await c.query(
          `INSERT INTO content_corrections (corrected_at, que_corrigio, regla) VALUES ($1,$2,$3)`,
          [co.corrected_at, co.que_corrigio, co.regla],
        )
      }
      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    }
  }

  // Verificación dura: conteos contra el seed
  const esperado: Record<string, number> = {
    content_ideas: SEED.ideas.length,
    content_pieces: SEED.piezas.length,
    content_formats: SEED.formatos.length,
    content_corrections: SEED.correcciones.length,
  }
  for (const [tabla, n] of Object.entries(esperado)) {
    const { rows: [{ c: real }] } = await c.query(`SELECT count(*)::int AS c FROM ${tabla}`)
    const ok = real >= n
    console.log(`${ok ? '✓' : '✗'} ${tabla}: ${real} filas (esperado ≥ ${n})`)
    if (!ok) throw new Error(`Conteo bajo en ${tabla}`)
  }
  // RLS habilitada en las 4
  const { rows: rls } = await c.query(
    `SELECT relname, relrowsecurity FROM pg_class
     WHERE relname IN ('content_pieces','content_ideas','content_formats','content_corrections')`)
  for (const r of rls) {
    console.log(`${r.relrowsecurity ? '✓' : '✗'} RLS ${r.relname}`)
    if (!r.relrowsecurity) throw new Error(`RLS apagada en ${r.relname}`)
  }
  await c.end()
  console.log('LISTO.')
}
main().catch((e) => { console.error(e); process.exit(1) })

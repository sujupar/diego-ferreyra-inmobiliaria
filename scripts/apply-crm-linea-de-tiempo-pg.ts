/**
 * Aplica `20261127000002_crm_linea_de_tiempo.sql` (crm-linea-de-tiempo, design.md D1) y la
 * VERIFICA. Aborta con `throw` ante la primera cosa que no cuadre.
 *
 *   npm i --no-save pg
 *   node --env-file=.env.local --import tsx scripts/apply-crm-linea-de-tiempo-pg.ts
 *
 * La migración es idempotente: el script la ejecuta DOS veces seguidas. Como re-ejecuta el
 * archivo ENTERO, un arreglo posterior de la función se hace también en el archivo.
 *
 * Las pruebas del trigger van dentro de UNA transacción que termina en ROLLBACK: es la base
 * de producción. Al final se cuentan SOLO las filas de prueba y se aborta si quedó alguna.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261127000002_crm_linea_de_tiempo.sql'
const NOMBRE_PRUEBA = '[TEST] apply-crm-linea-de-tiempo'
const CONTACTO_CONOCIDO = '7a636d2f-be56-4492-80ed-3bf23ba90e39'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD en el entorno')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const filas = async <R>(sql: string, v?: unknown[]) => (await c.query<R>(sql, v)).rows
  const contarPrueba = async () =>
    (await filas<{ n: number }>(
      `SELECT (SELECT count(*) FROM contacts WHERE full_name = $1)
            + (SELECT count(*) FROM deals WHERE property_address = $1)
            + (SELECT count(*) FROM tasks WHERE title = $1) AS n`, [NOMBRE_PRUEBA]))[0].n

  try {
    ok((await filas(`SELECT id FROM contacts WHERE id = $1`, [CONTACTO_CONOCIDO])).length === 1,
      'contacto conocido presente (proyecto mncsnastmcjdjxrehdep)')
    ok(Number(await contarPrueba()) === 0, 'sin filas de prueba antes de empezar')

    const sql = readFileSync(MIGRACION, 'utf8')
    await c.query(sql)
    await c.query(sql)
    console.log('✓ migración aplicada dos veces seguidas sin error')

    const cols = await filas<{ t: string; c: string }>(
      `SELECT table_name t, column_name c FROM information_schema.columns
        WHERE table_schema='public' AND ((table_name='deals' AND column_name='stage_changed_by')
           OR (table_name='tasks' AND column_name='completed_by'))`)
    ok(cols.length === 2, 'columnas deals.stage_changed_by y tasks.completed_by')
    const fks = await filas<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) def FROM pg_constraint
        WHERE contype='f' AND conrelid IN ('public.deals'::regclass,'public.tasks'::regclass)
          AND pg_get_constraintdef(oid) ILIKE ANY (ARRAY['%(stage_changed_by)%','%(completed_by)%'])`)
    ok(fks.length === 2 && fks.every((f) => /ON DELETE SET NULL/.test(f.def)), 'las dos FK a profiles son ON DELETE SET NULL')
    const idx = await filas<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname IN ('funnel_lead_submissions_contact_idx','tasks_contact_idx')`)
    ok(idx.length === 2, 'índices de lectura creados')
    const trg = await filas(`SELECT 1 FROM pg_trigger WHERE tgname='trg_deals_write_stage_history' AND NOT tgisinternal`)
    ok(trg.length === 1, 'el trigger del historial sigue siendo uno solo')

    // ── El trigger, con datos de prueba, dentro de una transacción ─────────────────────
    const [autor] = await filas<{ id: string }>(`SELECT id FROM profiles WHERE is_active ORDER BY created_at LIMIT 1`)
    ok(!!autor, 'hay un perfil para usar como autor')
    await c.query('BEGIN')
    try {
      const [contacto] = await filas<{ id: string }>(
        `INSERT INTO contacts (full_name) VALUES ($1) RETURNING id`, [NOMBRE_PRUEBA])
      const [proceso] = await filas<{ id: string }>(
        `INSERT INTO deals (contact_id, property_address, stage, origin, stage_changed_by)
         VALUES ($1, $2, 'request', NULL, NULL) RETURNING id`, [contacto.id, NOMBRE_PRUEBA])
      await c.query(`UPDATE deals SET stage='scheduled', stage_changed_by=$2 WHERE id=$1`, [proceso.id, autor.id])
      await c.query(`UPDATE deals SET stage='lost', stage_changed_by=NULL WHERE id=$1`, [proceso.id])
      const h = await filas<{ from_stage: string | null; to_stage: string; changed_by: string | null }>(
        `SELECT from_stage, to_stage, changed_by FROM deal_stage_history WHERE deal_id=$1 ORDER BY id`, [proceso.id])
      ok(h.length === 3, 'tres filas de historial (apertura y dos cambios)')
      ok(h[0].changed_by === null, 'la apertura sin autor queda sin autor')
      ok(h[1].changed_by === autor.id, 'el cambio con stage_changed_by guarda el autor')
      ok(h[2].changed_by === null, 'el cambio con stage_changed_by NULL queda sin autor (no hereda el anterior)')
      await c.query(`UPDATE deals SET notes = coalesce(notes,'') || ' ' WHERE id=$1`, [proceso.id])
      ok((await filas(`SELECT 1 FROM deal_stage_history WHERE deal_id=$1`, [proceso.id])).length === 3,
        'un UPDATE sin cambio de etapa no escribe historial')

      const [tarea] = await filas<{ id: string }>(
        `INSERT INTO tasks (type, title, contact_id, status) VALUES ('follow_up', $1, $2, 'pending') RETURNING id`,
        [NOMBRE_PRUEBA, contacto.id])
      await c.query(`UPDATE tasks SET status='completed', completed_at=now(), completed_by=$2 WHERE id=$1`, [tarea.id, autor.id])
      const [t] = await filas<{ completed_by: string | null }>(`SELECT completed_by FROM tasks WHERE id=$1`, [tarea.id])
      ok(t.completed_by === autor.id, 'con service role, completed_by guarda lo que manda la app')
    } finally {
      await c.query('ROLLBACK')
    }
    ok(Number(await contarPrueba()) === 0, 'después del ROLLBACK no quedó ninguna fila de prueba')
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

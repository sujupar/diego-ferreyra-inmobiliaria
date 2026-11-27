/**
 * Aplica `20261127000003_tareas_entrada_se_cierran.sql` (crm-tareas-y-campanita) y la
 * VERIFICA dentro de una transacción con ROLLBACK (es la base de producción).
 *
 *   node --env-file=.env.local --import tsx scripts/apply-tareas-entrada-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261127000003_tareas_entrada_se_cierran.sql'
const NOMBRE = '[TEST] apply-tareas-entrada'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const filas = async <R>(sql: string, v?: unknown[]) => (await c.query<R>(sql, v)).rows
  const contarPrueba = async () =>
    Number((await filas<{ n: string }>(
      `SELECT (SELECT count(*) FROM contacts WHERE full_name = $1) + (SELECT count(*) FROM deals WHERE property_address = $1)
            + (SELECT count(*) FROM tasks WHERE title LIKE $1 || '%') AS n`, [NOMBRE]))[0].n)
  try {
    ok(await contarPrueba() === 0, 'sin filas de prueba antes de empezar')
    const sql = readFileSync(MIGRACION, 'utf8')
    await c.query(sql)
    await c.query(sql)
    console.log('✓ migración aplicada dos veces seguidas sin error')
    const trg = await filas<{ def: string }>(`SELECT pg_get_triggerdef(oid) def FROM pg_trigger WHERE tgname='trg_deals_cerrar_tareas_de_entrada'`)
    ok(trg.length === 1 && /AFTER UPDATE OF stage, scheduled_date/.test(trg[0].def), 'trigger AFTER sobre stage y scheduled_date')

    const [autor] = await filas<{ id: string }>(`SELECT id FROM profiles WHERE is_active ORDER BY created_at LIMIT 1`)
    const [otro] = await filas<{ id: string }>(`SELECT id FROM profiles WHERE is_active AND id <> $1 ORDER BY created_at LIMIT 1`, [autor.id])
    await c.query('BEGIN')
    try {
      const [ct] = await filas<{ id: string }>(`INSERT INTO contacts (full_name) VALUES ($1) RETURNING id`, [NOMBRE])
      const proceso = async (stage: string, dia: string | null) =>
        (await filas<{ id: string }>(
          `INSERT INTO deals (contact_id, property_address, stage, origin, scheduled_date) VALUES ($1,$2,$3,NULL,$4::date) RETURNING id`,
          [ct.id, NOMBRE, stage, dia]))[0].id
      const tarea = async (deal: string, canal: string | null, asignado: string, titulo = `${NOMBRE} entrada`) =>
        (await filas<{ id: string }>(
          `INSERT INTO tasks (type, title, assigned_to, contact_id, deal_id, status, channel, due_date, due_time, all_day)
           VALUES ('update_contact', $1, $2, $3, $4, 'pending', $5, current_date, '10:00', false) RETURNING id`,
          [titulo, asignado, ct.id, deal, canal]))[0].id
      const estado = async (id: string) =>
        (await filas<{ status: string; completed_by: string | null }>(`SELECT status, completed_by FROM tasks WHERE id=$1`, [id]))[0]

      // 1. request → lost: se cierran las dos copias nuevas, no la vieja sin canal.
      const d1 = await proceso('request', null)
      // Una completada a mano ANTES de descartar no se reabre al deshacer.
      const manual = await tarea(d1, 'call', (await filas<{ id: string }>(`SELECT id FROM profiles WHERE is_active AND id <> ALL($1::uuid[]) ORDER BY created_at LIMIT 1`, [[autor.id, otro.id]]))[0].id, `${NOMBRE} entrada`)
      await c.query(`UPDATE tasks SET status='completed', completed_at = now() - interval '1 hour' WHERE id=$1`, [manual])
      const a = await tarea(d1, 'call', autor.id)
      const b = await tarea(d1, 'call', otro.id)
      const dv = await proceso('request', null)
      const vieja = await tarea(dv, null, autor.id, `${NOMBRE} vieja`)
      await c.query(`UPDATE deals SET stage='lost', stage_changed_by=$2, stage_changed_at=now() WHERE id=$1`, [d1, autor.id])
      await c.query(`UPDATE deals SET stage='lost' WHERE id=$1`, [dv])
      const [ea, eb, ev] = [await estado(a), await estado(b), await estado(vieja)]
      ok(ea.status === 'completed' && eb.status === 'completed', 'salir de Solicitud completa las dos copias')
      ok(ea.completed_by === autor.id && eb.completed_by === autor.id, 'con el autor del cambio de etapa')
      ok(ev.status === 'pending', 'la tarea vieja sin canal no se toca')

      // 1b. "Deshacer perdido": vuelve a Solicitud y las copias vuelven a pendientes.
      await c.query(`UPDATE deals SET stage='request' WHERE id=$1`, [d1])
      ok((await estado(a)).status === 'pending' && (await estado(b)).status === 'pending', 'volver a Solicitud las reabre')
      ok((await estado(a)).completed_by === null, 'sin quién la completó')
      ok((await estado(manual)).status === 'completed', 'la que alguien completó a mano antes de descartar no se reabre')
      // Borrarle el día a una coordinada NO reabre nada (solo "Deshacer perdido").
      const d5 = await proceso('scheduled', '2030-01-01')
      const t5 = await tarea(d5, 'call', autor.id)
      await c.query(`UPDATE tasks SET status='completed', completed_at=now() WHERE id=$1`, [t5])
      await c.query(`UPDATE deals SET scheduled_date = NULL WHERE id=$1`, [d5])
      ok((await estado(t5)).status === 'completed', 'borrar el día no reabre la entrada')

      // 2. scheduled sin día → con día (coordinar) también cierra.
      const d2 = await proceso('scheduled', null)
      const t2 = await tarea(d2, 'call', autor.id)
      await c.query(`UPDATE deals SET scheduled_date = current_date + 2 WHERE id=$1`, [d2])
      ok((await estado(t2)).status === 'completed', 'coordinar una solicitud sin día la cierra')

      // 3. Dentro de Solicitud (request → scheduled sin día) no cierra; reprogramar tampoco.
      const d3 = await proceso('request', null)
      const t3 = await tarea(d3, 'call', autor.id)
      await c.query(`UPDATE deals SET stage='scheduled' WHERE id=$1`, [d3])
      ok((await estado(t3)).status === 'pending', 'pasar a scheduled sin día sigue siendo Solicitud: no cierra')
      const d4 = await proceso('scheduled', '2030-01-01')
      const t4 = await tarea(d4, 'call', autor.id)
      await c.query(`UPDATE deals SET scheduled_date = '2030-01-02' WHERE id=$1`, [d4])
      ok((await estado(t4)).status === 'pending', 'reprogramar una coordinada no toca nada')
    } finally {
      await c.query('ROLLBACK')
    }
    ok(await contarPrueba() === 0, 'después del ROLLBACK no quedó ninguna fila de prueba')
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

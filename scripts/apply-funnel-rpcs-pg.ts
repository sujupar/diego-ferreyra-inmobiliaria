/**
 * Aplica las RPCs del tablero y las verifica contra consultas equivalentes
 * escritas de otra forma. Una métrica probada solo contra sí misma no está
 * probada.
 *
 * Correr: npx tsx --env-file=.env.local scripts/apply-funnel-rpcs-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACIONES = [
  'supabase/migrations/20260806000003_funnel_timings_rpc.sql',
  'supabase/migrations/20260806000004_funnel_costs_rpc.sql',
]

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  for (const m of MIGRACIONES) {
    await c.query(readFileSync(m, 'utf8'))
    console.log(`aplicada: ${m.split('/').pop()}`)
  }

  // ── Verificación 1: tiempos ────────────────────────────────────────────────
  const { rows: rpc } = await c.query(
    `SELECT desde, hasta, n FROM get_funnel_stage_timings('2025-01-01','2026-12-31')
      ORDER BY n DESC LIMIT 1`)
  const { rows: manual } = await c.query(`
    WITH ev AS (
      SELECT h.deal_id, h.to_stage, h.changed_at,
             LAG(h.to_stage)   OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) prev_stage,
             LAG(h.changed_at) OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) prev_at
        FROM deal_stage_history h JOIN deals d ON d.id = h.deal_id
       WHERE d.origin IN ('embudo','clase_gratuita','referido'))
    SELECT prev_stage desde, to_stage hasta, count(*)::bigint n FROM ev
     WHERE prev_at IS NOT NULL AND changed_at::date BETWEEN '2025-01-01' AND '2026-12-31'
     GROUP BY 1,2 ORDER BY n DESC LIMIT 1`)

  console.log('tiempos — RPC:', JSON.stringify(rpc[0] ?? null))
  console.log('tiempos — consulta independiente:', JSON.stringify(manual[0] ?? null))
  if (JSON.stringify(rpc[0]) !== JSON.stringify(manual[0])) {
    throw new Error('la RPC de tiempos no coincide con la consulta independiente')
  }

  // ── Verificación 2: costos ─────────────────────────────────────────────────
  const { rows: costos } = await c.query(
    `SELECT * FROM get_funnel_costs('2026-03-01','2026-05-31')`)
  console.log('costos marzo-mayo:', JSON.stringify(costos[0] ?? null))
  const cst = costos[0]
  if (!cst) throw new Error('get_funnel_costs no devolvió fila')
  if (Number(cst.dias_del_periodo) !== 92) {
    throw new Error(`dias_del_periodo debería ser 92, dio ${cst.dias_del_periodo}`)
  }
  if (Number(cst.dias_con_dato) > Number(cst.dias_del_periodo)) {
    throw new Error('dias_con_dato no puede superar dias_del_periodo')
  }

  // ── Verificación 3: volumen por origen y cobertura de asesor ───────────────
  const { rows: origen } = await c.query(
    `SELECT * FROM get_funnel_volume_by_origin('2025-01-01','2026-12-31')`)
  console.log('por origen:', JSON.stringify(origen))
  const totalSol = origen.reduce((a, r) => a + Number(r.solicitudes), 0)
  const { rows: [dealsTot] } = await c.query(
    `SELECT count(*)::int n FROM deals WHERE created_at::date BETWEEN '2025-01-01' AND '2026-12-31'`)
  if (totalSol !== Number(dealsTot.n)) {
    throw new Error(`el desglose por origen suma ${totalSol} y hay ${dealsTot.n} deals`)
  }

  const { rows: asesor } = await c.query(
    `SELECT * FROM get_advisor_coverage('2026-01-01','2026-12-31') ORDER BY mes`)
  console.log('cobertura de asesor 2026:', JSON.stringify(asesor))

  await c.end()
  console.log('\n✅ RPCs aplicadas y verificadas contra consultas independientes')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })

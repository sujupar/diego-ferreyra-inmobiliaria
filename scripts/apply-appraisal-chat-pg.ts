/**
 * Aplica `20261010000001_appraisal_chat.sql` y verifica contra la base que quedó
 * como el código espera: tablas, CHECKs, FKs con su ON DELETE, RLS encendida con
 * su política de lectura y bucket PRIVADO. Aborta si algo no cuadra.
 *
 * Uso: node --env-file=<.env.local> --import tsx scripts/apply-appraisal-chat-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function exigir(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
}

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    await c.query(readFileSync('supabase/migrations/20261010000001_appraisal_chat.sql', 'utf8'))

    const { rows: rls } = await c.query(`SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('appraisal_chat_threads','appraisal_chat_messages') ORDER BY relname`)
    exigir(rls.length === 2 && rls.every(r => r.relrowsecurity), 'falta una tabla o su RLS')

    const { rows: pol } = await c.query(`SELECT tablename, cmd FROM pg_policies
      WHERE tablename IN ('appraisal_chat_threads','appraisal_chat_messages')`)
    exigir(pol.length === 2 && pol.every(p => p.cmd === 'SELECT'), `políticas inesperadas: ${JSON.stringify(pol)}`)

    const { rows: fks } = await c.query(`SELECT conrelid::regclass::text AS tabla, confrelid::regclass::text AS a, confdeltype
      FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('appraisal_chat_threads','appraisal_chat_messages')`)
    // c = CASCADE, n = SET NULL. Toda FK a profiles DEBE ser SET NULL (CLAUDE.md).
    for (const f of fks) {
      if (f.a === 'profiles') exigir(f.confdeltype === 'n', `FK a profiles sin SET NULL en ${f.tabla}`)
      else exigir(f.confdeltype === 'c', `FK ${f.tabla}→${f.a} sin CASCADE`)
    }

    const { rows: chk } = await c.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint
      WHERE contype='c' AND conrelid='appraisal_chat_messages'::regclass`)
    exigir(chk.some(x => x.d.includes("'user'") && x.d.includes("'assistant'")), 'falta el CHECK de role')
    exigir(chk.some(x => x.d.includes("'ok'") && x.d.includes("'failed'")), 'falta el CHECK de status')

    const { rows: b } = await c.query(`SELECT public, file_size_limit FROM storage.buckets WHERE id='appraisal-chat'`)
    exigir(b.length === 1 && b[0].public === false, 'el bucket no existe o es público')

    console.log(`tablas con RLS: ${rls.map(r => r.relname).join(', ')}`)
    console.log(`políticas: ${pol.length} (solo lectura) · FKs: ${fks.length} · bucket privado (${b[0].file_size_limit} bytes)`)
    console.log('\n✅ aplicada y verificada')
  } finally {
    await c.end()
  }
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

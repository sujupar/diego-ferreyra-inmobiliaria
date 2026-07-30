/**
 * Aplica la migración de multimedia de WhatsApp (task 9) vía session pooler
 * (patrón CLAUDE.md). 100% aditiva: no borra ni cambia datos.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-whatsapp-media-migration-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  const { rows: antes } = await client.query('SELECT count(*)::int AS n FROM whatsapp_messages')

  await client.query(readFileSync('supabase/migrations/20260731000003_whatsapp_media.sql', 'utf8'))
  console.log('✅ supabase/migrations/20260731000003_whatsapp_media.sql')

  const { rows: despues } = await client.query('SELECT count(*)::int AS n FROM whatsapp_messages')
  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='whatsapp_messages' AND column_name LIKE 'media_%' ORDER BY column_name`,
  )
  const { rows: bucket } = await client.query(`SELECT id, public FROM storage.buckets WHERE id='whatsapp-media'`)
  const { rows: policy } = await client.query(
    `SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='whatsapp_media_storage_read'`,
  )

  console.log(`\nwhatsapp_messages: ${antes[0].n} antes → ${despues[0].n} después (ninguno se pierde)`)
  console.log('columnas media_*:', cols.map(r => r.column_name).join(', '))
  console.log('bucket whatsapp-media:', bucket.length > 0 ? `existe (public=${bucket[0].public})` : 'NO EXISTE')
  console.log('policy storage:', policy.length > 0 ? 'existe' : 'NO EXISTE')

  await client.end()

  if (antes[0].n !== despues[0].n) throw new Error('¡ALERTA! cambió la cantidad de mensajes')
  if (cols.length !== 4) throw new Error(`faltan columnas media_* (encontradas ${cols.length}/4)`)
  if (bucket.length === 0) throw new Error('el bucket whatsapp-media no se creó')
  if (policy.length === 0) throw new Error('la policy de storage no se creó')
  console.log('\n✅ aplicada y verificada — ningún dato tocado')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

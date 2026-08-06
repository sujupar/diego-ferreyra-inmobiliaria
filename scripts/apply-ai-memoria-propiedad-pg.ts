/**
 * Aplica `20260806000007_conversation_ai_state_property.sql` y VERIFICA.
 *
 * La migración le agrega a la memoria del agente de qué propiedad habla, para
 * que un resumen de una conversación no contamine otra (ver el archivo .sql).
 *
 * ABORTA si algo no cuadra, en vez de dejar un "listo" que no lo es. Lo que se
 * chequea después de correrla:
 *   - la columna existe;
 *   - ningún resumen quedó apuntando a una propiedad que no existe;
 *   - no quedó ningún teléfono con resumen viejo Y más de una propiedad
 *     (que es exactamente el estado que producía el bug).
 *
 * Es idempotente: el ALTER es IF NOT EXISTS y los dos UPDATE son acotados
 * (`WHERE property_id IS NULL`, `WHERE summary <> ''`), así que volver a
 * correrlo no pisa nada de lo que el sistema haya escrito mientras tanto.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/apply-ai-memoria-propiedad-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260806000007_conversation_ai_state_property.sql'

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD
  if (!password) throw new Error('Falta SUPABASE_DB_PASSWORD en .env.local')

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const antes = await c.query(`
    SELECT COUNT(*) AS filas,
           COUNT(*) FILTER (WHERE summary <> '') AS con_resumen
      FROM conversation_ai_state`)
  console.log(`Antes: ${antes.rows[0].filas} conversaciones, ${antes.rows[0].con_resumen} con resumen guardado.`)

  await c.query(readFileSync(MIGRACION, 'utf8'))
  console.log('Migración aplicada.')

  const columna = await c.query(`
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'conversation_ai_state' AND column_name = 'property_id'`)
  if (columna.rowCount !== 1) throw new Error('ABORTA: la columna property_id no quedó creada')

  const huerfanas = await c.query(`
    SELECT COUNT(*) AS n FROM conversation_ai_state s
     WHERE s.property_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM properties p WHERE p.id = s.property_id)`)
  if (Number(huerfanas.rows[0].n) > 0) {
    throw new Error(`ABORTA: ${huerfanas.rows[0].n} conversaciones apuntan a una propiedad que no existe`)
  }

  const contaminadas = await c.query(`
    SELECT COUNT(*) AS n FROM conversation_ai_state s
     WHERE s.summary <> ''
       AND (SELECT COUNT(DISTINCT m.property_id) FROM whatsapp_messages m
             WHERE m.phone_e164 = s.phone_e164 AND m.property_id IS NOT NULL) > 1`)
  if (Number(contaminadas.rows[0].n) > 0) {
    throw new Error(`ABORTA: quedaron ${contaminadas.rows[0].n} resúmenes que pueden mezclar dos propiedades`)
  }

  const despues = await c.query(`
    SELECT COUNT(*) FILTER (WHERE property_id IS NOT NULL) AS con_propiedad,
           COUNT(*) FILTER (WHERE summary <> '') AS con_resumen,
           COUNT(*) AS filas
      FROM conversation_ai_state`)
  const d = despues.rows[0]
  console.log(`Después: ${d.filas} conversaciones · ${d.con_propiedad} ya saben de qué propiedad hablan · ${d.con_resumen} con resumen.`)
  console.log('Verificado: la memoria del agente quedó atada a la propiedad.')

  await c.end()
}

main().catch(e => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})

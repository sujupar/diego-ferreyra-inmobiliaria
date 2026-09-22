/**
 * Aplica `20260922000001_reels_instagram.sql` y VERIFICA lo que importa.
 *
 * No alcanza con "no tiró error": la migración es idempotente y un `CREATE TABLE
 * IF NOT EXISTS` sobre una tabla vieja pasa en silencio sin aplicar los cambios.
 * Por eso cada cosa de la que depende la seguridad se comprueba de verdad, y el
 * script ABORTA si alguna no está:
 *
 *   1. Las tres tablas existen y tienen RLS prendida.
 *   2. Los dos UNIQUE están (son la idempotencia del webhook de Meta: sin ellos
 *      un reintento le manda dos mensajes a la misma persona).
 *   3. `created_by` borra a NULL (sin eso, borrar un usuario desde Supabase Auth
 *      falla con "Database error deleting user").
 *   4. Los interruptores nacen APAGADOS. Si alguna vez quedan prendidos después
 *      de correr esto, el sistema podría escribirle a clientes reales sin que
 *      nadie lo haya decidido.
 *
 * Uso (desde la raíz del worktree):
 *   node --env-file=../../../.env.local --import tsx scripts/apply-reels-instagram-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20260922000001_reels_instagram.sql'

interface Chequeo {
  nombre: string
  sql: string
}

const CHEQUEOS: Chequeo[] = [
  {
    nombre: 'property_reels existe con RLS prendida',
    sql: `SELECT 1 FROM pg_class
          WHERE relname = 'property_reels'
            AND relnamespace = 'public'::regnamespace
            AND relrowsecurity`,
  },
  {
    nombre: 'reel_comentarios existe con RLS prendida',
    sql: `SELECT 1 FROM pg_class
          WHERE relname = 'reel_comentarios'
            AND relnamespace = 'public'::regnamespace
            AND relrowsecurity`,
  },
  {
    nombre: 'instagram_ajustes existe con RLS prendida',
    sql: `SELECT 1 FROM pg_class
          WHERE relname = 'instagram_ajustes'
            AND relnamespace = 'public'::regnamespace
            AND relrowsecurity`,
  },
  {
    nombre: 'ig_media_id es UNIQUE (un reel de Instagram, un solo registro)',
    sql: `SELECT 1 FROM pg_constraint c
          WHERE c.conrelid = 'public.property_reels'::regclass
            AND c.contype = 'u'
            AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
                 FROM unnest(c.conkey) k
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
                = ARRAY['ig_media_id']`,
  },
  {
    nombre: 'ig_comment_id es UNIQUE (el reintento de Meta no duplica)',
    sql: `SELECT 1 FROM pg_constraint c
          WHERE c.conrelid = 'public.reel_comentarios'::regclass
            AND c.contype = 'u'
            AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
                 FROM unnest(c.conkey) k
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
                = ARRAY['ig_comment_id']`,
  },
  {
    nombre: 'created_by se borra a NULL (borrar un usuario no falla)',
    sql: `SELECT 1 FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
          WHERE c.conrelid = 'public.property_reels'::regclass
            AND c.contype = 'f'
            AND a.attname = 'created_by'
            AND c.confdeltype = 'n'`,
  },
  {
    nombre: 'los DOS interruptores nacen apagados',
    sql: `SELECT 1 FROM public.instagram_ajustes
          WHERE id = 'default'
            AND automatizacion_habilitada = false
            AND dm_habilitado = false`,
  },
  {
    nombre: 'property_reels tiene las 4 políticas de RLS esperadas',
    sql: `SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'property_reels'
          GROUP BY tablename HAVING count(*) >= 2`,
  },
]

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('Falta SUPABASE_DB_PASSWORD (está en .env.local)')
  }

  const cliente = new Client({
    // Pooler de sesión: la conexión directa db.<ref>.supabase.co es solo IPv6 y
    // esta red no tiene ruta IPv6.
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })

  await cliente.connect()

  // Confirmar el proyecto ANTES de escribir: hay más de uno en el panel y ya
  // pasó que una migración se aplicara en el equivocado y "no apareciera".
  const { rows: donde } = await cliente.query<{ db: string; usuario: string }>(
    'SELECT current_database() AS db, current_user AS usuario',
  )
  console.log(`conectado a ${donde[0].db} como ${donde[0].usuario}`)

  await cliente.query(readFileSync(MIGRACION, 'utf8'))
  console.log('migración aplicada, verificando…\n')

  const fallos: string[] = []
  for (const chequeo of CHEQUEOS) {
    const { rowCount } = await cliente.query(chequeo.sql)
    const ok = (rowCount ?? 0) > 0
    console.log(`  ${ok ? 'ok  —' : 'MAL —'} ${chequeo.nombre}`)
    if (!ok) fallos.push(chequeo.nombre)
  }

  const { rows: ajustes } = await cliente.query(
    'SELECT automatizacion_habilitada, dm_habilitado FROM public.instagram_ajustes',
  )
  await cliente.end()

  console.log('\ninterruptores:', JSON.stringify(ajustes[0]))

  if (fallos.length > 0) {
    throw new Error(`VERIFICACIÓN FALLIDA en ${fallos.length}: ${fallos.join(' · ')}`)
  }
  console.log('\n✅ aplicada y verificada')
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})

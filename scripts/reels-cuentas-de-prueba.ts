/**
 * Ver, agregar o quitar cuentas de prueba de los reels.
 *
 * Una cuenta de prueba recibe la respuesta REAL aunque el reel esté en
 * simulacro; al resto de la gente el simulacro la sigue registrando sin
 * escribirle. Sirve para probar sobre un reel real sin tocar a ningún cliente.
 *
 * No hay pantalla para esto a propósito (spec 2026-09-22): es una herramienta de
 * prueba, no una opción del día a día del asesor.
 *
 * Uso (desde la raíz del worktree):
 *   node --env-file=<ruta>/.env.local --import tsx scripts/reels-cuentas-de-prueba.ts --ver
 *   node --env-file=<ruta>/.env.local --import tsx scripts/reels-cuentas-de-prueba.ts --agregar juliandavidpr
 *   node --env-file=<ruta>/.env.local --import tsx scripts/reels-cuentas-de-prueba.ts --quitar juliandavidpr
 */
import { Client } from 'pg'
import { normalizarUsuario, USUARIO_INSTAGRAM } from '../lib/social/reels/decision'

async function main() {
  const [accion, crudo] = process.argv.slice(2)
  if (!['--ver', '--agregar', '--quitar'].includes(accion ?? '')) {
    throw new Error('uso: --ver | --agregar <usuario> | --quitar <usuario>')
  }
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  try {
    if (accion !== '--ver') {
      // Se valida lo escrito ANTES de pasar a minúscula (ver esCuentaDePrueba).
      const usuario = normalizarUsuario(crudo ?? '')
      if (!USUARIO_INSTAGRAM.test((crudo ?? '').trim().replace(/^@+/, '')) || !usuario) {
        throw new Error(`"${crudo ?? ''}" no es un nombre de usuario de Instagram válido`)
      }
      const sql = accion === '--agregar'
        // array_append solo si no está: correrlo dos veces no la duplica.
        ? `UPDATE public.instagram_ajustes
              SET cuentas_de_prueba = CASE WHEN $1 = ANY(cuentas_de_prueba) THEN cuentas_de_prueba
                                           ELSE array_append(cuentas_de_prueba, $1) END,
                  updated_at = now()
            WHERE id = 'default'`
        : `UPDATE public.instagram_ajustes
              SET cuentas_de_prueba = array_remove(cuentas_de_prueba, $1), updated_at = now()
            WHERE id = 'default'`
      const r = await c.query(sql, [usuario])
      if (r.rowCount !== 1) throw new Error('no se encontró la fila default de instagram_ajustes')
      console.log(`${accion === '--agregar' ? 'agregada' : 'quitada'}: ${usuario}`)
    }

    const { rows: [fila] } = await c.query(
      `SELECT automatizacion_habilitada, dm_habilitado, cuentas_de_prueba
         FROM public.instagram_ajustes WHERE id = 'default'`,
    )
    console.log('ajustes:', JSON.stringify(fila))
  } finally {
    await c.end()
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})

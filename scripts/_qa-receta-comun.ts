/**
 * Piezas comunes de las recetas de datos de prueba del CRM (`_qa-ficha-datos.ts` y
 * `_qa-cartera-datos.ts`). Salieron de la receta de la ficha (crm-cartera-por-rol, tarea
 * 8.1) para que las dos apliquen EXACTAMENTE las mismas protecciones sobre la base de
 * producción (la vista previa de Netlify usa el mismo Supabase):
 *
 *  - la conexión directa por el session pooler (nunca la clave de servicio de la app);
 *  - la supresión de los emails de prueba en `mailchimp_suppressions` ANTES de crear
 *    cualquier proceso, releída después de escribirla: la etiqueta de secuencia de Mailchimp
 *    no mira el origen para `scheduled` con día ni para `visited`, y `undo-lost` y el
 *    barrido `reconcileMailchimp` CREAN al email en la audiencia real si no está suprimido;
 *  - el borrado de las filas de Mailchimp de los procesos de prueba (el log no tiene FK y
 *    no se borra solo) y, al final, de las supresiones;
 *  - el invariante de métricas: ningún proceso de prueba con `origin` cargado (ni `embudo`
 *    ni `clase_gratuita`, que entrarían al embudo y a los públicos de Meta), cero renglones
 *    `synced` en Mailchimp, y todos los emails suprimidos mientras haya procesos;
 *  - el archivo de ids, fuera del repo: es de UNA sesión. Otra sesión que corra
 *    `borrar`/`verificar` usa el respaldo por nombre de cada receta.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { Client } from 'pg'

export const CLAUDE_QA = 'claude.qa@inmodf.com.ar'
export const JULIAN_COORDINADOR = 'inmobiliariadiegofer.deem471@passmail.com'
export const ASESOR_DE_PRUEBA = 'inmobiliariadiegofer.kick529@passmail.com'

export function cortar(msg: string): never {
  throw new Error(`CORTA: ${msg}`)
}

export async function conectar(): Promise<Client> {
  if (!process.env.SUPABASE_DB_PASSWORD) cortar('falta SUPABASE_DB_PASSWORD en el entorno')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  return c
}

export async function filas<R>(c: Client, sql: string, valores?: unknown[]): Promise<R[]> {
  return (await c.query<R>(sql, valores)).rows
}

export async function uno<R>(c: Client, sql: string, valores?: unknown[]): Promise<R> {
  const r = await filas<R>(c, sql, valores)
  if (r.length !== 1) throw new Error(`se esperaba 1 fila y vinieron ${r.length}: ${sql.slice(0, 80)}`)
  return r[0]
}

export async function contarFilas(c: Client, sql: string, valores: unknown[]): Promise<number> {
  return (await uno<{ n: number }>(c, sql, valores)).n
}

export async function perfil(c: Client, email: string): Promise<string> {
  return (await uno<{ id: string }>(c, `SELECT id FROM profiles WHERE email = $1`, [email])).id
}

/** Corre `trabajo` en una transacción: o entra todo, o nada. */
export async function enTransaccion(c: Client, trabajo: () => Promise<void>): Promise<void> {
  await c.query('BEGIN')
  try {
    await trabajo()
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }
}

/** Fecha de Argentina desplazada `dias`, como `YYYY-MM-DD`. */
export function fechaArgentina(dias: number): string {
  const ahora = new Date(Date.now() + dias * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ahora)
}

// ── Archivo de ids ───────────────────────────────────────────────────────────────────────

export interface ArchivoDeIds<T> {
  ruta: string
  leer(): T | null
  guardar(ids: T): void
  borrar(): void
}

export function archivoDeIds<T extends object>(ruta: string): ArchivoDeIds<T> {
  return {
    ruta,
    leer() {
      if (!existsSync(ruta)) return null
      const crudo: unknown = JSON.parse(readFileSync(ruta, 'utf8'))
      if (!crudo || typeof crudo !== 'object') cortar(`el archivo de ids ${ruta} no se entiende`)
      return crudo as T
    },
    guardar(ids) {
      writeFileSync(ruta, JSON.stringify(ids, null, 2))
    },
    borrar() {
      if (existsSync(ruta)) unlinkSync(ruta)
    },
  }
}

// ── Mailchimp ────────────────────────────────────────────────────────────────────────────

/** Suprime los emails ANTES de cualquier proceso, en su propio commit, y los relee. */
export async function suprimirEmails(c: Client, emails: string[]): Promise<void> {
  await c.query(
    `INSERT INTO mailchimp_suppressions (email, reason) SELECT unnest($1::text[]), 'test'
     ON CONFLICT (email) DO NOTHING`, [emails])
  const leidos = await filas<{ email: string }>(c,
    `SELECT email FROM mailchimp_suppressions WHERE email = ANY($1::text[])`, [emails])
  if (leidos.length !== emails.length) {
    cortar(`se encontraron ${leidos.length} de los ${emails.length} emails de prueba en mailchimp_suppressions; no se crea nada`)
  }
  console.log(`✓ suprimidos para Mailchimp: ${emails.join(', ')}`)
}

export interface ConteoMailchimp {
  mailchimpEstado: number
  mailchimpLog: number
  supresiones: number
}

export async function contarMailchimp(c: Client, procesos: string[], emails: string[]): Promise<ConteoMailchimp> {
  return {
    mailchimpEstado: await contarFilas(c, `SELECT count(*)::int AS n FROM mailchimp_sync_state WHERE deal_id = ANY($1::uuid[])`, [procesos]),
    mailchimpLog: await contarFilas(c, `SELECT count(*)::int AS n FROM mailchimp_sync_log
      WHERE deal_id = ANY($1::uuid[]) OR lower(email) = ANY($2::text[])`, [procesos, emails]),
    supresiones: await contarFilas(c, `SELECT count(*)::int AS n FROM mailchimp_suppressions WHERE email = ANY($1::text[])`, [emails]),
  }
}

/** Dentro de la transacción del `borrar`, ANTES de los procesos (el log no tiene FK). */
export async function borrarMailchimpDeProcesos(c: Client, procesos: string[], emails: string[]): Promise<void> {
  await c.query(`DELETE FROM mailchimp_sync_log WHERE deal_id = ANY($1::uuid[]) OR lower(email) = ANY($2::text[])`, [procesos, emails])
  await c.query(`DELETE FROM mailchimp_sync_state WHERE deal_id = ANY($1::uuid[])`, [procesos])
}

/** Al final del `borrar`: mientras existió un proceso de prueba, las supresiones tenían que estar. */
export async function borrarSupresiones(c: Client, emails: string[]): Promise<void> {
  await c.query(`DELETE FROM mailchimp_suppressions WHERE email = ANY($1::text[])`, [emails])
}

// ── Invariante de métricas ───────────────────────────────────────────────────────────────

/**
 * Devuelve las fallas (vacío = verde) e imprime lo que mira. `procesos` son los ids de los
 * procesos de prueba (vivos o no: los que ya no existen no cuentan).
 */
export async function invarianteDeMetricas(c: Client, procesos: string[], emails: string[]): Promise<string[]> {
  const fallas: string[] = []
  const conOrigen = await contarFilas(c,
    `SELECT count(*)::int AS n FROM deals WHERE id = ANY($1::uuid[]) AND origin IS NOT NULL`, [procesos])
  if (conOrigen !== 0) fallas.push(`${conOrigen} proceso(s) de prueba con origin cargado`)
  const enMetricas = await contarFilas(c,
    `SELECT count(*)::int AS n FROM deals WHERE id = ANY($1::uuid[]) AND origin IN ('embudo','clase_gratuita')`, [procesos])
  if (enMetricas !== 0) fallas.push(`${enMetricas} proceso(s) de prueba cuentan en el embudo`)
  console.log(`· procesos de prueba en el embudo (embudo/clase_gratuita): ${enMetricas}`)

  const sincronizados = await contarFilas(c,
    `SELECT count(*)::int AS n FROM mailchimp_sync_log
      WHERE status = 'synced' AND (deal_id = ANY($1::uuid[]) OR lower(email) = ANY($2::text[]))`, [procesos, emails])
  console.log(`· renglones 'synced' de Mailchimp de prueba: ${sincronizados}`)
  if (sincronizados !== 0) {
    fallas.push(`${sincronizados} renglón(es) 'synced' en Mailchimp: frenar el QA y avisarle al dueño que saque ese email de la audiencia`)
  }
  const vivos = await contarFilas(c, `SELECT count(*)::int AS n FROM deals WHERE id = ANY($1::uuid[])`, [procesos])
  const supresiones = await contarFilas(c,
    `SELECT count(*)::int AS n FROM mailchimp_suppressions WHERE email = ANY($1::text[])`, [emails])
  if (vivos > 0 && supresiones !== emails.length) {
    fallas.push(`hay ${vivos} proceso(s) de prueba y solo ${supresiones} de los ${emails.length} emails suprimidos`)
  }
  return fallas
}

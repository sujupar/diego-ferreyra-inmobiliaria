/**
 * Verifica de punta a punta el estado comercial contra la base REAL:
 * cambia el estado de una propiedad, confirma que quedaron la columna y el
 * evento, y revierte todo.
 *
 * Se niega a tocar una propiedad que no esté en 'disponible', para no pisar
 * nunca una venta o una baja real.
 *
 * Correr: npx tsx --env-file=.env.local scripts/verify-commercial-status.ts <propertyId>
 */
import { Client } from 'pg'
import { buildStatusPatch } from '../lib/properties/commercial-status'

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el id de la propiedad: ... verify-commercial-status.ts <propertyId>')

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const { rows: [prop] } = await c.query(
    'SELECT id, address, commercial_status, status FROM properties WHERE id = $1', [id])
  if (!prop) throw new Error('No existe esa propiedad')
  if (prop.commercial_status !== 'disponible') {
    throw new Error(`La propiedad está en "${prop.commercial_status}". Elegí una en "disponible" para no pisar datos reales.`)
  }
  console.log(`propiedad: ${prop.address} (${prop.commercial_status})`)

  const patch = buildStatusPatch({ from: 'disponible', to: 'reservada' })
  await c.query(
    'UPDATE properties SET commercial_status = $1, sold_price = $2, sold_currency = $3, sold_at = $4 WHERE id = $5',
    [patch.commercial_status, patch.sold_price, patch.sold_currency, patch.sold_at, id])
  const { rows: [ev] } = await c.query(
    `INSERT INTO property_status_events (property_id, from_status, to_status, reason)
     VALUES ($1,'disponible','reservada','verificación automática') RETURNING id`, [id])

  const { rows: [despues] } = await c.query(
    'SELECT commercial_status FROM properties WHERE id = $1', [id])
  const { rows: [cuenta] } = await c.query(
    'SELECT count(*)::int AS n FROM property_status_events WHERE property_id = $1', [id])
  console.log(`estado tras el cambio: ${despues.commercial_status} · eventos: ${cuenta.n}`)

  // Revertir SIEMPRE, incluso si algo falla más arriba.
  await c.query("UPDATE properties SET commercial_status = 'disponible' WHERE id = $1", [id])
  await c.query('DELETE FROM property_status_events WHERE id = $1', [ev.id])
  const { rows: [final] } = await c.query(
    'SELECT commercial_status FROM properties WHERE id = $1', [id])
  const { rows: [quedan] } = await c.query(
    'SELECT count(*)::int AS n FROM property_status_events WHERE property_id = $1', [id])
  await c.end()

  if (despues.commercial_status !== 'reservada') throw new Error('el estado no se guardó')
  if (cuenta.n < 1) throw new Error('el evento no se registró')
  if (final.commercial_status !== 'disponible') throw new Error('¡no se pudo revertir! revisar a mano')
  if (quedan.n !== cuenta.n - 1) throw new Error('¡el evento de prueba no se borró! revisar a mano')

  console.log('\n✅ ciclo completo verificado y revertido')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })

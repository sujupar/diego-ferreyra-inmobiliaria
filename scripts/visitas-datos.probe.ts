// node --require scripts/_qa-precarga-server-only.cjs --env-file=../../../.env.local --import tsx scripts/visitas-datos.probe.ts
/**
 * Ejercita lib/visitas/datos.ts contra la base REAL con una visita `[TEST]` que
 * borra al final. Necesita la migración 20261010000001 aplicada.
 */
import { Client } from 'pg'
import * as datos from '@/lib/visitas/datos'

async function main() {
  const props = await datos.buscarPropiedadesParaVisita({ q: 'doblas' })
  console.log('buscar "doblas":', props.map(p => p.address))
  if (props.length === 0) throw new Error('no encontró Doblas 248')
  const prop = props[0]
  const consultas = await datos.listarConsultasDeLaPropiedad(prop.id)
  console.log(`consultas de ${prop.address}: ${consultas.length}`)
  const asesor = prop.assigned_to
  if (!asesor) throw new Error('la propiedad no tiene asesor')

  const leadId = await datos.asegurarComprador({
    propertyId: prop.id, nombre: '[TEST] Probe visitas', telefono: '+54 9 11 0000-0001', email: null,
    mensaje: null, source: 'visita:otro', asignadoA: asesor,
  })
  const otraVez = await datos.asegurarComprador({
    propertyId: prop.id, nombre: '[TEST] Probe visitas', telefono: '1100000001', email: null,
    mensaje: null, source: 'visita:otro', asignadoA: asesor,
  })
  console.log(`mismo teléfono en otro formato → mismo comprador: ${leadId === otraVez ? 'sí ✓' : 'NO ✗'}`)

  const visitaId = await datos.insertarVisita({
    property_id: prop.id, advisor_id: asesor, client_name: '[TEST] Probe visitas', client_email: null,
    client_phone: '+5491100000001', scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'pending_confirmation', notes: null, origin: 'otro', origin_detail: 'probe', lead_id: leadId,
    portal_inquiry_id: null, created_by: asesor, changed_by: asesor,
  })
  const r1 = await datos.actualizarVisita(visitaId, 'pending_confirmation', { status: 'scheduled' }, asesor)
  const r2 = await datos.actualizarVisita(visitaId, 'pending_confirmation', { status: 'cancelled' }, asesor)
  console.log(`confirmar: ${r1.ok ? 'ok ✓' : 'falló ✗'} · segunda escritura con estado viejo: ${r2.ok ? 'PISÓ ✗' : 'rechazada ✓'}`)
  const v = await datos.leerVisita(visitaId)
  const ev = await datos.eventosDeLaVisita(visitaId)
  console.log(`visita leída: ${v?.status} · origen ${v?.origin} · eventos: ${ev.map(e => e.kind).join(', ')}`)

  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(`DELETE FROM property_visits WHERE id=$1`, [visitaId])
  await c.query(`DELETE FROM property_leads WHERE id=$1 AND name LIKE '[TEST]%'`, [leadId])
  await c.end()
  console.log('limpieza: visita y comprador [TEST] borrados')
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })

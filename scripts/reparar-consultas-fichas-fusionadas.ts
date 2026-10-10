/**
 * Mueve a la ficha vigente las consultas de portales y los avisos del mapa que
 * quedaron colgados de copias fusionadas (`[FUSIONADA-><prefijo>] …`).
 *
 *   node --env-file=.env.local --import tsx scripts/reparar-consultas-fichas-fusionadas.ts            # informe (no escribe)
 *   node --env-file=.env.local --import tsx scripts/reparar-consultas-fichas-fusionadas.ts --commit   # aplica
 *
 * Por qué hace falta: la fusión del 2026-07-13 no movió `portal_inquiries` ni
 * `portal_property_map`. Con el aviso del mapa apuntando a la copia, cada
 * consulta NUEVA de ese aviso seguía cayendo en una ficha descartada (Entre Ríos
 * 2333: 39 consultas, la última del 2026-10-06) y no aparecía en "quién consultó".
 * Mover solo las consultas no alcanza: sin mover el mapa, se vuelven a acumular.
 *
 * Qué decide: `lib/portals/fichas-fusionadas.ts` (puro y testeado). Ante una
 * copia que no resuelve a UNA ficha vigente, no toca nada y lo informa.
 * Con `--commit` escribe en UNA transacción y confirma solo si lo movido es
 * exactamente lo informado (o lo informado más consultas llegadas en el medio).
 * Aprobado por el dueño el 2026-10-10.
 */
import { Client } from 'pg'
import { prefijoDeFusion, resolverFichaVigente, type FichaR } from '@/lib/portals/fichas-fusionadas'

const COMMIT = process.argv.includes('--commit')

function corto(id: string) { return id.slice(0, 8) }

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  console.log(COMMIT ? '=== MODO COMMIT: se va a escribir ===' : '=== MODO INFORME: no se escribe nada ===')
  await c.query(COMMIT ? 'BEGIN' : 'BEGIN READ ONLY')
  try {
    const { rows: fichas } = await c.query<FichaR>('SELECT id, address, status FROM properties')
    const copias = fichas.filter(f => prefijoDeFusion(f.address) !== null)
    console.log(`Copias fusionadas encontradas: ${copias.length}`)

    let movidasTotal = 0
    for (const copia of copias) {
      const { rows: consultas } = await c.query<{ id: string }>(
        'SELECT id FROM portal_inquiries WHERE property_id = $1 ORDER BY id', [copia.id])
      const { rows: mapa } = await c.query<{ id: string; portal: string; external_code: string | null; active: boolean }>(
        'SELECT id, portal, external_code, active FROM portal_property_map WHERE property_id = $1 ORDER BY id', [copia.id])
      const { rows: mensajes } = await c.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM whatsapp_messages WHERE property_id = $1', [copia.id])

      const res = resolverFichaVigente(copia, fichas)
      console.log(`\n## ${copia.address} (${corto(copia.id)})`)
      console.log(`- consultas: ${consultas.length} · avisos del mapa: ${mapa.length} · mensajes de WhatsApp (no se tocan): ${mensajes[0].n}`)
      for (const m of mapa) console.log(`  · aviso ${m.portal} ${m.external_code ?? '(sin código)'} ${m.active ? 'activo' : 'inactivo'}`)
      if (!res.ok) { console.log(`- NO SE TOCA: ${res.motivo}`); continue }
      console.log(`- destino: ${res.vigente.address} (${corto(res.vigente.id)}, ${res.vigente.status})`)
      if (consultas.length === 0 && mapa.length === 0) { console.log('- nada para mover'); continue }
      if (!COMMIT) continue

      const informadas = new Set(consultas.map(r => r.id))
      const { rows: movidas } = await c.query<{ id: string }>(
        'UPDATE portal_inquiries SET property_id = $1 WHERE property_id = $2 RETURNING id', [res.vigente.id, copia.id])
      const faltan = [...informadas].filter(id => !movidas.some(m => m.id === id))
      if (faltan.length > 0) throw new Error(`no se movieron ${faltan.length} consultas informadas: aborto`)

      const { rows: mapaMovido } = await c.query<{ id: string }>(
        'UPDATE portal_property_map SET property_id = $1 WHERE property_id = $2 RETURNING id', [res.vigente.id, copia.id])
      if (mapaMovido.length !== mapa.length) throw new Error(`avisos del mapa: informados ${mapa.length}, movidos ${mapaMovido.length}: aborto`)

      console.log(`- MOVIDAS: ${movidas.length} consultas, ${mapaMovido.length} avisos del mapa`)
      console.log(`  ids de consultas movidas (para deshacer: volver property_id a ${copia.id}): ${movidas.map(m => m.id).join(',')}`)
      console.log(`  ids de avisos movidos: ${mapaMovido.map(m => m.id).join(',')}`)
      movidasTotal += movidas.length
    }

    if (COMMIT) {
      await c.query('COMMIT')
      // Verificación releyendo, fuera de la transacción.
      const ids = copias.map(f => f.id)
      const { rows: quedan } = await c.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM portal_inquiries WHERE property_id = ANY($1)', [ids])
      const { rows: quedanMapa } = await c.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM portal_property_map WHERE property_id = ANY($1)', [ids])
      console.log(`\nVerificación: consultas que siguen en copias fusionadas: ${quedan[0].n} · avisos: ${quedanMapa[0].n}`)
      console.log(`✅ ${movidasTotal} consultas movidas`)
    } else {
      await c.query('ROLLBACK')
    }
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    await c.end()
  }
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

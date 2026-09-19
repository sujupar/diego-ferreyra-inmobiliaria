/**
 * Carga (o completa) el mapa propio: todas las celdas del AMBA que no estén en
 * 'ok', de a una, con reintentos y pausa entre celdas (los servidores públicos
 * de Overpass limitan por IP: de a una y sin apuro).
 *
 * Correr: node --env-file=.env.local --import tsx scripts/mapa-cargar.ts [--todas] [--solo <idCelda>]
 *   --todas   vuelve a descargar también las que ya están en 'ok'
 *   --solo X  solo esa celda (para probar)
 *
 * Es idempotente: se puede cortar y volver a correr; retoma las que faltan.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { todasLasCeldas, celdasCubriendo, type Celda } from '@/lib/mapa/celdas'
import { actualizarCelda, asegurarCeldas } from '@/lib/mapa/actualizar-celda'

const TIMEOUT_CELDA_MS = 90_000
const REINTENTOS = 3
const ESPERAS_MS = [5_000, 20_000, 45_000]
const PAUSA_ENTRE_CELDAS_MS = 1_500

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Centro aproximado de CABA: las celdas más cercanas son las que más propiedades van a tener. */
const CENTRO = { lat: -34.61, lng: -58.44 }

/**
 * Orden de carga: primero las celdas que rodean a las propiedades activas (las
 * que se usan HOY), después de la más cercana al centro a la más lejana. Los
 * servidores públicos hacen esperar entre 4 y 60 s por celda: lo importante
 * tiene que llegar primero.
 */
async function ordenar(db: SupabaseClient, celdas: Celda[]): Promise<Celda[]> {
  const { data } = await db.from('properties').select('latitude, longitude').neq('status', 'descartada').not('latitude', 'is', null)
  const prioridad = new Set<string>()
  for (const p of (data ?? []) as Array<{ latitude: number; longitude: number }>) {
    for (const id of celdasCubriendo(p.latitude, p.longitude, 1500).ids) prioridad.add(id)
  }
  const distancia = (c: Celda) => Math.hypot((c.sur + c.norte) / 2 - CENTRO.lat, (c.oeste + c.este) / 2 - CENTRO.lng)
  return [...celdas].sort((a, b) => Number(prioridad.has(b.id)) - Number(prioridad.has(a.id)) || distancia(a) - distancia(b))
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const args = process.argv.slice(2)
  const todas = args.includes('--todas')
  const solo = args.includes('--solo') ? args[args.indexOf('--solo') + 1] : null

  const celdas = todasLasCeldas()
  await asegurarCeldas(db, celdas)
  const { data: estados } = await db.from('mapa_celdas').select('id, estado')
  const ok = new Set(((estados ?? []) as Array<{ id: string; estado: string }>).filter(e => e.estado === 'ok').map(e => e.id))
  const pendientes = (await ordenar(db, celdas)).filter(c => (solo ? c.id === solo : todas || !ok.has(c.id)))
  console.log(`celdas: ${celdas.length} · ya en ok: ${ok.size} · a procesar: ${pendientes.length}`)

  let bien = 0, mal = 0, filasTotal = 0
  for (const [n, c] of pendientes.entries()) {
    let r = await actualizarCelda(db, c, TIMEOUT_CELDA_MS)
    for (let intento = 0; !r.ok && intento < REINTENTOS; intento++) {
      console.log(`   ${c.id} falló (${r.error}); reintento en ${ESPERAS_MS[intento] / 1000} s`)
      await dormir(ESPERAS_MS[intento])
      r = await actualizarCelda(db, c, TIMEOUT_CELDA_MS)
    }
    if (r.ok) { bien++; filasTotal += r.filas } else mal++
    console.log(`[${n + 1}/${pendientes.length}] ${c.id} ${r.ok ? 'ok' : 'ERROR'} filas=${r.filas} ${(r.ms / 1000).toFixed(1)}s${r.error ? ` ${r.error}` : ''}`)
    await dormir(PAUSA_ENTRE_CELDAS_MS)
  }
  console.log(`\nterminado: ${bien} ok, ${mal} con error, ${filasTotal} filas guardadas`)
  if (mal) process.exitCode = 1
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

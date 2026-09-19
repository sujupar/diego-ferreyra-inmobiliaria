/**
 * Carga el mapa propio desde el JSONL que produce `scripts/mapa-extraer-osm.py`
 * (archivo de OpenStreetMap de Geofabrik): reparte las filas por celda y guarda
 * cada celda con la MISMA función que usa la actualización mensual
 * (`guardarCelda`: upsert + borrar lo que ya no vino + celda en 'ok').
 *
 * Correr:
 *   python3 scripts/mapa-extraer-osm.py argentina-latest.osm.pbf amba-lugares.jsonl
 *   node --env-file=.env.local --import tsx scripts/mapa-cargar-archivo.ts amba-lugares.jsonl
 *
 * Todas las celdas quedan en 'ok' (una celda sin filas es campo o río: vacía de
 * verdad, no "sin cargar"). Idempotente.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { todasLasCeldas, celdaDe } from '@/lib/mapa/celdas'
import { asegurarCeldas, guardarCelda } from '@/lib/mapa/actualizar-celda'
import type { FilaMapa, TipoFila } from '@/lib/mapa/overpass-celda'

const TIPOS = new Set<TipoFila>(['subte', 'tren', 'plaza', 'colegio', 'universidad', 'hospital', 'parada', 'recorrido'])
const DE_COLECTIVO = new Set<TipoFila>(['parada', 'recorrido'])

function trazoValido(t: unknown): t is Array<[number, number]> {
  return Array.isArray(t) && t.length >= 2 && t.every(p => Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'number' && Number.isFinite(x)))
}

function validar(crudo: unknown): Omit<FilaMapa, 'celda'> | null {
  const o = crudo as Partial<FilaMapa>
  if (!o || typeof o.osm_id !== 'string' || !/^[nwr]\d+$/.test(o.osm_id)) return null
  if (!TIPOS.has(o.tipo as TipoFila)) return null
  const tipo = o.tipo as TipoFila
  if (typeof o.lat !== 'number' || typeof o.lng !== 'number') return null
  if (!Array.isArray(o.lineas) || o.lineas.some(l => typeof l !== 'string')) return null
  if (DE_COLECTIVO.has(tipo) && (o.lineas.length === 0 || o.lineas.some(l => !/^\d+$/.test(l)))) return null
  if (!DE_COLECTIVO.has(tipo) && !(typeof o.nombre === 'string' && o.nombre.trim())) return null
  if (tipo === 'recorrido' && !trazoValido(o.trazo)) return null
  const fila: Omit<FilaMapa, 'celda'> = { osm_id: o.osm_id, tipo, nombre: o.nombre ?? '', lineas: o.lineas, lat: o.lat, lng: o.lng }
  if (tipo === 'recorrido') fila.trazo = o.trazo
  return fila
}

async function main() {
  const archivo = process.argv[2]
  if (!archivo) throw new Error('Pasá el archivo JSONL')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const porCelda = new Map<string, FilaMapa[]>()
  let leidas = 0, descartadas = 0
  for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
    if (!linea.trim()) continue
    leidas++
    const fila = validar(JSON.parse(linea))
    const celda = fila ? celdaDe(fila.lat, fila.lng) : null
    if (!fila || !celda) { descartadas++; continue }
    const lista = porCelda.get(celda.id) ?? []
    lista.push({ ...fila, celda: celda.id })
    porCelda.set(celda.id, lista)
  }
  console.log(`filas leídas: ${leidas} · descartadas: ${descartadas} · celdas con datos: ${porCelda.size}`)

  const celdas = todasLasCeldas()
  await asegurarCeldas(db, celdas)
  let total = 0
  for (const [n, c] of celdas.entries()) {
    const filas = porCelda.get(c.id) ?? []
    total += await guardarCelda(db, c, filas)
    if ((n + 1) % 50 === 0 || n === celdas.length - 1) console.log(`[${n + 1}/${celdas.length}] guardadas ${total} filas`)
  }
  console.log(`\n✅ ${celdas.length} celdas en 'ok', ${total} lugares en el mapa propio`)
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

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
 *
 * Antes de escribir NADA se controla que el archivo esté entero (la última
 * línea es la marca de fin del extractor, con la cantidad de filas) y que
 * ninguna celda pierda más de la mitad de lo que tiene (`descargaSospechosa`).
 * Si algo no cuadra, no se toca la base. `--forzar` saltea el segundo control
 * (solo si se sabe por qué una zona cambió tanto).
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { todasLasCeldas, celdaDe } from '@/lib/mapa/celdas'
import { asegurarCeldas, descargaSospechosa, guardarCelda, liberarCelda, reservarCelda } from '@/lib/mapa/actualizar-celda'
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
  const archivo = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (!archivo) throw new Error('Pasá el archivo JSONL')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const lineas = readFileSync(archivo, 'utf8').split('\n').filter(l => l.trim())
  const fin = JSON.parse(lineas.pop() ?? '{}') as { fin?: boolean; filas?: number }
  if (fin.fin !== true || fin.filas !== lineas.length) {
    throw new Error(`el archivo está incompleto (sin marca de fin o con ${lineas.length} filas contra ${fin.filas ?? '?'} escritas): no se toca la base`)
  }

  const porCelda = new Map<string, FilaMapa[]>()
  let leidas = 0, descartadas = 0
  for (const linea of lineas) {
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
  const { data: previas, error: errPrevias } = await db.from('mapa_celdas').select('id, filas')
  if (errPrevias) throw new Error(`no se pudieron leer las celdas: ${errPrevias.message}`)
  const antes = new Map(((previas ?? []) as Array<{ id: string; filas: number | null }>).map(p => [p.id, p.filas ?? 0]))
  const encogen = celdas.filter(c => descargaSospechosa(antes.get(c.id) ?? 0, porCelda.get(c.id)?.length ?? 0))
  if (encogen.length && !process.argv.includes('--forzar')) {
    throw new Error(`${encogen.length} celdas perderían más de la mitad de sus filas (${encogen.slice(0, 5).map(c => `${c.id}: ${antes.get(c.id)} → ${porCelda.get(c.id)?.length ?? 0}`).join(', ')}): no se toca la base. Revisá el archivo; --forzar si el cambio es real.`)
  }
  await asegurarCeldas(db, celdas)
  let total = 0
  const ocupadas: string[] = []
  for (const [n, c] of celdas.entries()) {
    // Si la actualización mensual está escribiendo esta celda justo ahora, no se
    // pisa (dos escrituras a la vez pueden vaciarla): se informa y se vuelve a correr.
    if (!(await reservarCelda(db, c))) { ocupadas.push(c.id); continue }
    const filas = porCelda.get(c.id) ?? []
    try {
      total += await guardarCelda(db, c, filas)
    } finally {
      await liberarCelda(db, c)
    }
    if ((n + 1) % 50 === 0 || n === celdas.length - 1) console.log(`[${n + 1}/${celdas.length}] guardadas ${total} filas`)
  }
  if (ocupadas.length) {
    console.log(`\n⚠️ ${ocupadas.length} celdas ocupadas por otra actualización, sin cargar: ${ocupadas.join(', ')}. Volvé a correr en 2 minutos.`)
    process.exitCode = 1
    return
  }
  console.log(`\n✅ ${celdas.length} celdas en 'ok', ${total} lugares en el mapa propio`)
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

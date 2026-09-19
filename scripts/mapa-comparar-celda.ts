/**
 * Paridad del mapa propio: para UNA celda, compara las filas que da Overpass
 * (lo que usa la actualización mensual) con las del archivo de Geofabrik (lo
 * que usa la carga completa). TIENEN que ser las mismas: si no, cada
 * actualización mensual borra o cambia datos buenos.
 *
 * Correr SIEMPRE que se toque una regla de `lib/mapa/overpass-celda.ts` o de
 * `scripts/mapa-extraer-osm.py`:
 *   node --env-file=.env.local --import tsx scripts/mapa-comparar-celda.ts <archivo.jsonl> <idCelda>
 * Ej. celda densa (Almagro): -34.650_-58.450 · con estaciones mixtas (Once): -34.650_-58.450
 *
 * Solo lee (Overpass y el archivo). Verificado el 2026-09-19 en la celda más
 * densa: mismas 3.145 filas en los 8 tipos.
 */
import { readFileSync } from 'node:fs'
import { todasLasCeldas, celdaDe } from '@/lib/mapa/celdas'
import { descargarCelda } from '@/lib/mapa/actualizar-celda'
import { filasDesdeRespuesta, type FilaMapa } from '@/lib/mapa/overpass-celda'

async function main() {
  const [archivo, id] = process.argv.slice(2).filter(a => a !== '--')
  const c = todasLasCeldas().find(x => x.id === id)
  if (!archivo || !c) throw new Error('Uso: mapa-comparar-celda.ts <archivo.jsonl> <idCelda>')
  const delArchivo = (readFileSync(archivo, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) as Array<FilaMapa & { fin?: boolean }>)
    .filter(o => !o.fin && celdaDe(o.lat, o.lng)?.id === id)
  const t = Date.now()
  const deOverpass = filasDesdeRespuesta(await descargarCelda(c, AbortSignal.timeout(90_000)), c)
  console.log(`celda ${id} · Overpass en ${Date.now() - t} ms`)
  let diferencias = 0
  for (const tipo of new Set([...delArchivo.map(o => o.tipo), ...deOverpass.map(f => f.tipo)])) {
    const a = new Map(delArchivo.filter(o => o.tipo === tipo).map(o => [o.osm_id, o]))
    const v = new Map(deOverpass.filter(f => f.tipo === tipo).map(f => [f.osm_id, f]))
    const soloA = [...a.keys()].filter(k => !v.has(k))
    const soloV = [...v.keys()].filter(k => !a.has(k))
    const distintas = [...a.keys()].filter(k => v.has(k) && (JSON.stringify(a.get(k)!.lineas) !== JSON.stringify(v.get(k)!.lineas) || a.get(k)!.nombre !== v.get(k)!.nombre))
    diferencias += soloA.length + soloV.length + distintas.length
    console.log(`${tipo.padEnd(12)} archivo ${String(a.size).padStart(5)} · overpass ${String(v.size).padStart(5)} · solo archivo ${soloA.length} ${soloA.slice(0, 4).join(',')} · solo overpass ${soloV.length} ${soloV.slice(0, 4).join(',')} · distintas ${distintas.length} ${distintas.slice(0, 3).map(k => `${k}: ${a.get(k)!.nombre}/${a.get(k)!.lineas} ≠ ${v.get(k)!.nombre}/${v.get(k)!.lineas}`).join(' | ')}`)
  }
  console.log(diferencias ? `\n❌ ${diferencias} diferencias` : '\n✅ mismas filas')
  if (diferencias) process.exitCode = 1
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

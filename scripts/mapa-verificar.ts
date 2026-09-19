/**
 * Verificación del mapa propio (criterios 2, 3 y 4 del spec 2026-09-19-mapa-propio).
 *
 *  1. Paridad: para las propiedades cuya zona se investigó EN VIVO (Overpass) y
 *     quedó guardada en `descripcion_ia`, compara lugares y colectivos con los
 *     del mapa propio.
 *  2. Las propiedades activas: todas tienen que responder desde la base.
 *  3. 1.000 puntos al azar del AMBA interior: 1.000 de 1.000, con tiempos.
 *
 * Solo lee. Correr: node --env-file=.env.local --import tsx scripts/mapa-verificar.ts
 */
import { createClient } from '@supabase/supabase-js'
import { lugaresDesdeBase } from '@/lib/mapa/consultar'
import type { LugarCercano } from '@/lib/descripcion/tipos'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function clave(l: LugarCercano) { return `${l.tipo}|${l.nombre}` }

async function paridad() {
  console.log('\n══ 1. Paridad con lo que dio Overpass en vivo')
  const { data } = await db.from('properties').select('id, address, latitude, longitude, descripcion_ia').not('descripcion_ia', 'is', null)
  for (const p of (data ?? []) as Array<{ id: string; address: string; latitude: number; longitude: number; descripcion_ia: { zona?: { datos?: { mapa?: { lugares: LugarCercano[]; colectivos?: string[] } | null } } } }>) {
    const vivo = p.descripcion_ia?.zona?.datos?.mapa
    if (!vivo) { console.log(`- ${p.address}: sin datos en vivo guardados (falló aquella vez), se salta`); continue }
    const base = await lugaresDesdeBase(db, p.latitude, p.longitude)
    if (base.estado !== 'ok') { console.log(`- ${p.address}: SIN COBERTURA en la base ✗`); continue }
    const vivoPorClave = new Map(vivo.lugares.map(l => [clave(l), l]))
    const basePorClave = new Map(base.lugares.map(l => [clave(l), l]))
    const iguales = [...basePorClave.keys()].filter(k => vivoPorClave.has(k))
    const difMetros = iguales.map(k => Math.abs(basePorClave.get(k)!.metros - vivoPorClave.get(k)!.metros))
    const soloVivo = [...vivoPorClave.keys()].filter(k => !basePorClave.has(k))
    const soloBase = [...basePorClave.keys()].filter(k => !vivoPorClave.has(k))
    const colVivo = new Set(vivo.colectivos ?? []), colBase = new Set(base.colectivos)
    console.log(`- ${p.address}: ${iguales.length} lugares iguales (dif. máx. ${Math.max(0, ...difMetros)} m) · solo en vivo: ${soloVivo.join('; ') || '—'} · solo en base: ${soloBase.join('; ') || '—'}`)
    console.log(`    colectivos en vivo: ${[...colVivo].join(',')} | en base: ${[...colBase].join(',')} | solo en vivo: ${[...colVivo].filter(x => !colBase.has(x)).join(',') || '—'} | solo en base: ${[...colBase].filter(x => !colVivo.has(x)).join(',') || '—'}`)
  }
}

async function activas() {
  console.log('\n══ 2. Propiedades activas desde la base')
  const { data } = await db.from('properties').select('id, address, latitude, longitude').neq('status', 'descartada')
  let ok = 0, sinCoords = 0
  const fallas: string[] = []
  for (const p of (data ?? []) as Array<{ id: string; address: string; latitude: number | null; longitude: number | null }>) {
    if (p.latitude == null || p.longitude == null) { sinCoords++; continue }
    try {
      const r = await lugaresDesdeBase(db, p.latitude, p.longitude)
      if (r.estado === 'ok') {
        ok++
        const estaciones = r.lugares.filter(l => l.tipo === 'subte' || l.tipo === 'tren').length
        console.log(`  ✓ ${p.address.slice(0, 45).padEnd(45)} ${String(r.lugares.length).padStart(2)} lugares (${estaciones} estaciones) · ${r.colectivos.length} colectivos`)
      } else fallas.push(`${p.address}: sin cobertura`)
    } catch (e) { fallas.push(`${p.address}: ${(e as Error).message}`) }
  }
  console.log(`  → ${ok} de ${(data ?? []).length - sinCoords} respondieron desde la base${sinCoords ? ` (${sinCoords} sin coordenadas)` : ''}${fallas.length ? `\n  FALLAS: ${fallas.join(' | ')}` : ''}`)
}

async function milPuntos() {
  console.log('\n══ 3. 1.000 puntos al azar (CABA y conurbano)')
  const tiempos: number[] = []
  let ok = 0
  const fallas: string[] = []
  for (let i = 0; i < 1000; i++) {
    const lat = -34.85 + Math.random() * 0.4
    const lng = -58.75 + Math.random() * 0.45
    const t = performance.now()
    try {
      const r = await lugaresDesdeBase(db, lat, lng)
      if (r.estado === 'ok') ok++
      else fallas.push(`${lat.toFixed(4)},${lng.toFixed(4)} sin cobertura`)
    } catch (e) { fallas.push(`${lat.toFixed(4)},${lng.toFixed(4)} ${(e as Error).message}`) }
    tiempos.push(performance.now() - t)
  }
  tiempos.sort((a, b) => a - b)
  const media = tiempos.reduce((a, b) => a + b, 0) / tiempos.length
  console.log(`  → ${ok} de 1000 respondidas · tiempo medio ${media.toFixed(0)} ms · p95 ${tiempos[949].toFixed(0)} ms · peor ${tiempos[999].toFixed(0)} ms`)
  if (fallas.length) console.log(`  FALLAS (${fallas.length}): ${fallas.slice(0, 5).join(' | ')}`)
}

async function main() {
  await paridad()
  await activas()
  await milPuntos()
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

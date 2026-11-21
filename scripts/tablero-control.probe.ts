/**
 * Números de control del Tablero de /metrics contra la base REAL (solo lectura).
 *
 * Uso (desde la raíz del repo, con el .env.local del proyecto):
 *   node --require ./scripts/precarga-server-only.cjs --env-file=.env.local --import tsx scripts/tablero-control.probe.ts
 *
 * Los "esperados" son los del documento de la reunión del 21/11/2026 (1–20/11
 * contra 1–20/10, datos al cierre del 20/11). Meta en `meta_ads_daily` recibe el
 * día en curso recién con la sincronización del día siguiente.
 */
import { armarTablero } from '../lib/metrics/tablero/servidor'
import { anunciosDelPeriodo } from '../lib/metrics/tablero/meta-vivo'
import { reelsDelTablero } from '../lib/metrics/tablero/reels-vivo'

const NOV = { desde: '2026-11-01', hasta: '2026-11-20' }

type Fila = [string, unknown, unknown]
const filas: Fila[] = []
const ver = (nombre: string, esperado: unknown, obtenido: unknown) => filas.push([nombre, esperado, obtenido])
const r0 = (n: number | null | undefined) => (n == null ? null : Math.round(n))
const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10)

async function main() {
  const t = await armarTablero({ rango: NOV, comparar: 'mes_anterior' })
  const a = t.tasacion
  ver('Comparado contra', '2026-10-01 a 2026-10-20', `${t.comparacion.rango?.desde} a ${t.comparacion.rango?.hasta}`)
  ver('Inversión Meta nov USD', 213, r0(t.inversionMeta.actual?.usd))
  ver('Inversión Meta oct USD', 206, r0(t.inversionMeta.anterior?.usd))
  ver('Tasación nov: inversión ARS', 267_086, r0(a.actual?.gasto))
  ver('Tasación nov: registros', 9, a.actual?.registros)
  ver('Tasación nov: costo por registro USD', 19.1, r1(a.actual?.costoPorRegistroUsd))
  ver('Tasación nov: visitas Meta', 277, a.actual?.visitas)
  ver('Tasación oct: registros', 15, a.anterior?.registros)
  ver('Tasación oct: costo por registro USD', 11.2, r1(a.anterior?.costoPorRegistroUsd))
  ver('Embudo nov', '—', a.embudo.map(p => `${p.etapa} ${p.cantidad}`).join(' → '))
  ver('Landing publicada', 'B', a.landing.publicadas.join(','))
  ver('Registros de propiedades nov', 9, t.registros.actual.total)
  ver('Personas registradas en propiedades nov', 8, t.registros.actual.personas)
  ver('Registros de propiedades oct 1–20', 3, t.registros.anterior?.total)
  ver('Consultas portales nov', 59, t.consultas.actual.total)
  ver('Consultas portales oct 1–20', 100, t.consultas.anterior?.total)
  ver('Captadas nov', 2, t.propiedades.actual.captadas)
  ver('Margen neto nov USD', -1_836, r0(t.plata.actual.margenNetoUsd))
  ver('Margen neto oct 1–20 USD', 2_671, r0(t.plata.anterior?.margenNetoUsd))

  const mejor = await armarTablero({ rango: NOV, comparar: 'mejor_mes' })
  ver('Mejor mes', '2026-01', mejor.comparacion.mes)
  ver('Mejor mes: tramo', '2026-01-01 a 2026-01-20', `${mejor.comparacion.rango?.desde} a ${mejor.comparacion.rango?.hasta}`)

  const vivo = await anunciosDelPeriodo(NOV)
  ver('Anuncios activos', 5, vivo.disponible ? vivo.activos.length : vivo.motivo)
  ver('Anuncios: registros de la campaña', 9, vivo.disponible ? vivo.totales.campania.registros : vivo.motivo)

  const reels = await reelsDelTablero(NOV)
  ver('Reels: comentarios por persona registrada', 67, r0(reels.total.comentariosPorRegistro))

  for (const [n, e, o] of filas) {
    const ok = typeof e === 'number' ? e === o : e === '—' ? '·' : String(e) === String(o)
    console.log(`${ok === true ? 'OK ' : ok === '·' ? ' · ' : 'DIF'} ${n}: esperado ${e} · obtenido ${o}`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

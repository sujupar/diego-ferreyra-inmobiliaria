/**
 * Números de control del Tablero de /metrics contra la base REAL (solo lectura).
 *
 * Uso (desde la raíz del repo, con el .env.local del proyecto):
 *   node --require ./scripts/precarga-server-only.cjs --env-file=.env.local --import tsx scripts/tablero-control.probe.ts
 *
 * Los "esperados" son los del documento de la reunión del 20/11/2026 (1–20/11
 * contra 1–20/10). OJO: Meta en ese documento salió de la API en vivo, que ya
 * incluye el gasto de HOY; `meta_ads_daily` lo tiene recién cuando corre la
 * sincronización diaria. Por eso el día en curso puede quedar corto acá.
 */
import { armarTablero } from '../lib/metrics/tablero/servidor'
import { cargarDatos } from '../lib/metrics/panel/servidor'
import { calcularAjustes, totalAnuncios } from '../lib/metrics/tablero/anuncios'
import { anunciosEnVivo } from '../lib/metrics/tablero/meta-vivo'

const NOV = { desde: '2026-11-01', hasta: '2026-11-20' }

type Fila = [string, unknown, unknown]
const filas: Fila[] = []
const ver = (nombre: string, esperado: unknown, obtenido: unknown) => filas.push([nombre, esperado, obtenido])
const r0 = (n: number | null | undefined) => (n == null ? null : Math.round(n))

async function main() {
  const t = await armarTablero({ rango: NOV, comparar: 'mes_anterior' })
  const a = t.anuncios
  ver('Comparado contra', '2026-10-01 a 2026-10-20', `${t.parametros.comparado?.desde} a ${t.parametros.comparado?.hasta}`)
  ver('Tasación nov: inversión ARS', 264_359, r0(a.actual?.gasto))
  ver('Tasación nov: visitas Meta', 271, a.actual?.visitas)
  ver('Tasación nov: registros', 9, a.actual?.registros)
  ver('Tasación oct: inversión ARS', 255_912, r0(a.anterior?.gasto))
  ver('Tasación oct: registros', 15, a.anterior?.registros)
  ver('Último día con gasto en meta_ads_daily', '—', a.ultimoDiaConGasto)

  // Ajuste del 19/11 (todavía no está cargado como hito): se calcula igual que si lo estuviera.
  const d = await cargarDatos({ rango: NOV, comparar: 'mes_anterior', agrupar: 'mes', vista: 'eventos' }, { metaDesde: '2026-01-01', metaHasta: t.parametros.hoy })
  const [aj] = calcularAjustes([{ id: 'x', fecha: '2026-11-19', embudo: 'tasacion', titulo: 'ajuste 19/11', detalle: null }], d.meta, t.parametros.hoy, d.rangoMeta.desde)
  ver('Antes del ajuste (1–18/11): gasto', 237_868, r0(aj.antes?.gasto))
  ver('Antes del ajuste: registros', 7, aj.antes?.registros)
  ver('Antes del ajuste: costo por registro', 33_981, r0(aj.antes?.costoPorRegistro))
  ver('Después del ajuste (desde 20/11): gasto', '14.948 (desde 19/11 19:58, en vivo)', r0(aj.despues?.gasto))
  ver('Después del ajuste: registros', 1, aj.despues?.registros)
  ver('Día 19/11 completo (excluido de los dos lados)', '—', r0(totalAnuncios(d.meta, { desde: '2026-11-19', hasta: '2026-11-19' }, 'tasacion')?.gasto))

  const c = t.comercial
  ver('Registros de propiedades nov', 9, c.registros.total)
  ver('Registros por propiedad nov', 'Roque Pérez 3059: 3, Salta 297: 3, Moldes 2112: 2, Jean Jaurès 1185: 1',
    c.registros.porPropiedad.map(p => `${p.direccion}: ${p.total}`).join(', '))
  ver('Registros de propiedades oct 1–20', 3, c.registrosAntes)
  ver('Consultas portales nov', '59 (ZP 34, AP 17, ML 8)', `${c.consultas.total} (${c.consultas.porPortal.map(p => `${p.portal} ${p.cantidad}`).join(', ')})`)
  ver('Consultas portales oct 1–20', 100, c.consultasAntes)
  ver('Embudo tasación nov: solicitudes', 8, c.actual.solicitudes)
  ver('Embudo tasación nov: agendadas', 0, c.actual.agendadas)
  ver('Sin agendar > 48 h (nov)', '—', c.sinAgendar.length)
  ver('Referidos nov', '—', JSON.stringify(c.referidos))
  ver('Captadas nov', 2, t.propiedades.actual.captadas)
  ver('Captadas oct 1–20', 3, t.propiedades.anterior?.captadas)
  ver('Cartera disponible hoy', '—', t.propiedades.cartera.disponible)
  ver('Margen neto nov USD', -1_824, r0(t.plata.actual.margenNetoUsd))
  ver('Margen neto oct 1–20 USD', 2_671, r0(t.plata.anterior?.margenNetoUsd))
  ver('Margen neto del año USD', '—', r0(t.cabecera.margenNetoAnioUsd))
  ver('Facturado del año USD', '—', r0(t.cabecera.facturadoAnioUsd))
  ver('Página publicada', 'B', t.pagina.publicadas.join(','))
  ver('Página: visitas / conversión', '—', `${t.pagina.actual.visitas} / ${t.pagina.actual.conversion}`)
  ver('Videos vigentes', 'hero-tasacion-b-animado, hero-clase', t.pagina.videos?.map(v => v.videoKey).join(', '))
  ver('Estados', '—', [a.estado, c.estado, t.pagina.estado, t.propiedades.estado, t.plata.estado].join(' · '))

  const vivo = await anunciosEnVivo()
  ver('Meta en vivo', 'conjuntos Validados y Pruebas', vivo.disponible ? `${vivo.anuncios.length} anuncios en ${[...new Set(vivo.anuncios.map(x => x.conjunto))].join(' / ')}` : vivo.motivo)

  for (const [n, e, o] of filas) {
    const ok = typeof e === 'number' ? e === o : e === '—' ? '·' : String(e) === String(o)
    console.log(`${ok === true ? 'OK ' : ok === '·' ? ' · ' : 'DIF'} ${n}: esperado ${e} · obtenido ${o}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

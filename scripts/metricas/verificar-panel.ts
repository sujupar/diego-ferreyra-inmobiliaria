/**
 * Arma el panel con los datos REALES y lo imprime mes a mes, para compararlo con
 * la tabla validada a mano ("Meta y embudos mes a mes" del Mapa de métricas).
 * Solo lectura (menos el caché de alcance, que no se toca acá).
 * Uso: node --env-file=.env.local --import tsx --tsconfig tsconfig.verif.json scripts/metricas/verificar-panel.ts [desde] [hasta]
 */
import { armarPanel } from '@/lib/metrics/panel/servidor'

async function main() {
  const desde = process.argv[2] ?? '2026-01-01', hasta = process.argv[3] ?? '2026-11-04'
  const t0 = Date.now()
  const p = await armarPanel({ rango: { desde, hasta }, comparar: 'ninguno', agrupar: 'mes', vista: 'cohorte' })
  console.log(`armado en ${Date.now() - t0} ms · excluidas`, p.excluidas)
  for (const e of ['tasacion', 'clase'] as const) {
    const c = p.actual.canales[e]
    console.log(`\n${e.toUpperCase()} (cohorte) inversión USD ${c.inversionUsd.toFixed(0)} · clics ${c.clics} · visitas ${c.visitas} · conversión ${(100 * (c.conversionLanding ?? 0)).toFixed(1)}%`)
    console.log('  ' + c.pasos.map(x => `${x.etapa} ${x.cantidad}${x.costoUsd ? ` (USD ${x.costoUsd.toFixed(1)})` : ''}`).join(' → '))
    const s = await armarPanel({ rango: { desde, hasta }, comparar: 'ninguno', agrupar: 'mes', vista: 'cohorte' })
    void s
  }
  // Mes a mes por cohorte (como la tabla validada).
  const meses: string[] = []
  for (let m = new Date(desde + 'T00:00:00Z'); m.toISOString().slice(0, 10) <= hasta; m.setUTCMonth(m.getUTCMonth() + 1)) meses.push(m.toISOString().slice(0, 7))
  for (const e of ['tasacion', 'clase'] as const) {
    console.log(`\n${e} mes | USD | visitas | solicitudes | agendadas | realizadas | captadas`)
    for (const m of meses) {
      const fin = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10)
      const r = await armarPanel({ rango: { desde: m + '-01', hasta: fin < hasta ? fin : hasta }, comparar: 'ninguno', agrupar: 'mes', vista: 'cohorte' })
      const c = r.actual.canales[e], q = c.pasos
      console.log(`  ${m} | ${c.inversionUsd.toFixed(0)} | ${c.visitas ?? '—'} | ${q[0].cantidad} | ${q[1].cantidad} | ${q[2].cantidad} | ${q[4].cantidad}`)
    }
  }
  const pl = p.actual.plata
  console.log(`\nPLATA ventas ${pl.ventas} · facturación ${pl.facturacionUsd} · margen bruto ${pl.margenBrutoUsd.toFixed(0)} · fijos ${pl.gastosFijosUsd.toFixed(0)} · neto ${pl.margenNetoUsd.toFixed(0)}`)
  console.log('ADQUISICIÓN', p.actual.adquisicion)
  console.log('PLAN 8/sem', p.plan)
  console.log('VARIANTES', p.variantes)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

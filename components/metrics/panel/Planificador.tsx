'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Panel } from '@/lib/metrics/panel/servidor'
import { planificar, type TasasPlan } from '@/lib/metrics/panel/economia'
import { num, usd } from './formato'

const inp = 'w-24 rounded-md border px-2 py-1 text-sm bg-background text-right tabular-n'

/**
 * "¿Cuánto hay que invertir para lograr N tasaciones por semana?" con las tasas
 * del período elegido. Todas se pueden cambiar para probar escenarios.
 */
export function Planificador({ panel }: { panel: Panel }) {
  const base = panel.plan.tasas
  const [n, setN] = useState(8)
  const [t, setT] = useState<TasasPlan>(base)
  useEffect(() => { setT(base) }, [base])
  const plan = useMemo(() => planificar(n, t), [n, t])

  const pctIn = (k: keyof TasasPlan, label: string) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" min="0" max="100" step="0.5" className={inp} value={Math.round(t[k] * 1000) / 10}
          onChange={e => setT({ ...t, [k]: Number(e.target.value) / 100 })} />%
      </span>
    </label>
  )
  const usdIn = (k: keyof TasasPlan, label: string) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">USD <input type="number" min="0" className={inp} value={Math.round(t[k] * 10) / 10} onChange={e => setT({ ...t, [k]: Number(e.target.value) })} /></span>
    </label>
  )

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Planificador: ¿cuánto hay que invertir?</h3>
        <p className="text-xs text-muted-foreground">Arranca con las tasas reales del embudo de tasación en el período elegido (siguiendo a los que pidieron). Cambialas para probar escenarios. Elegí un período ya maduro: los pedidos de la última semana todavía no tuvieron tiempo de tasarse.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            <span>Tasaciones realizadas por semana</span>
            <input type="number" min="1" className={inp} value={n} onChange={e => setN(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          {pctIn('realizadaPorSolicitud', 'De cada solicitud, se tasa')}
          {usdIn('costoPorSolicitudUsd', 'Costo por solicitud')}
          {pctIn('captadaPorRealizada', 'De cada tasación, se capta')}
          {pctIn('tasaVenta', 'De cada captación, se vende')}
          {usdIn('limpioPorVentaUsd', 'Limpio por venta')}
          <button className="text-xs underline text-muted-foreground" onClick={() => setT(base)}>Volver a las tasas del período</button>
        </div>
        <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm">
          <Fila t="Solicitudes por semana" v={num(plan.solicitudesSemana, 0)} cuenta={`${n} ÷ ${num(t.realizadaPorSolicitud * 100, 1)}%`} />
          <Fila t="Inversión por semana" v={usd(plan.inversionSemanaUsd)} cuenta={`solicitudes × ${usd(t.costoPorSolicitudUsd, 1)}`} fuerte />
          <Fila t="Inversión por mes" v={usd(plan.inversionMesUsd)} cuenta="semana × 4,33" fuerte />
          <Fila t="Captaciones por mes" v={num(plan.captacionesMes, 1)} cuenta={`${n} × 4,33 × ${num(t.captadaPorRealizada * 100, 1)}%`} />
          <Fila t="Ventas por mes (cuando se vendan)" v={num(plan.ventasMes, 1)} cuenta={`captaciones × ${num(t.tasaVenta * 100, 0)}%`} />
          <Fila t="Limpio por mes (cuando se vendan)" v={usd(plan.limpioMesUsd)} cuenta={`ventas × ${usd(t.limpioPorVentaUsd)}`} />
          {plan.retorno != null && <p className="text-xs text-muted-foreground pt-1">Cada dólar invertido volvería {plan.retorno.toFixed(1).replace('.', ',')} veces. Las ventas llegan unos 3 meses después de captar (mediana del año).</p>}
        </div>
      </div>
    </section>
  )
}

function Fila({ t, v, cuenta, fuerte }: { t: string; v: string; cuenta: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{t}<span className="block text-xs text-muted-foreground">{cuenta}</span></span>
      <span className={`tabular-n ${fuerte ? 'text-lg font-semibold' : ''}`}>{v}</span>
    </div>
  )
}

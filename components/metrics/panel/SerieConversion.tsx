'use client'

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Panel } from '@/lib/metrics/panel/servidor'
import { clave, type Agrupar } from '@/lib/metrics/panel/rango'
import { NOMBRE_EMBUDO } from './EmbudoCanal'
import { etiquetaGrupo, fechaCorta, pct, usd } from './formato'

/**
 * Solicitudes (barras) y % de conversión de la landing (línea) en el tiempo,
 * con una marca en cada cambio cargado como hito: así se ve cuándo y cuánto se
 * movió la conversión.
 */
export function SerieConversion({ embudo, panel, agrupar }: { embudo: 'tasacion' | 'clase'; panel: Panel; agrupar: Agrupar }) {
  const datos = (panel.series[embudo] ?? []).map(p => ({
    ...p,
    etiqueta: etiquetaGrupo(p.clave, agrupar),
    conversionPct: p.conversion == null ? null : Math.round(p.conversion * 1000) / 10,
    costoSolicitud: p.solicitudes && p.inversionUsd ? p.inversionUsd / p.solicitudes : null,
  }))
  const hitos = panel.hitos.filter(h => !h.embudo || h.embudo === embudo)
  const etiquetaDe = new Map(datos.map(d => [d.clave, d.etiqueta]))

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <h3 className="font-semibold">{NOMBRE_EMBUDO[embudo]}: cómo cambió en el tiempo</h3>
        <p className="text-xs text-muted-foreground">Barras: solicitudes. Línea: % de las visitas que se registran. Las líneas verticales son los cambios cargados (abajo, en "Cargar datos").</p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis yAxisId="n" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11 }} unit="%" />
            <Tooltip
              formatter={(v, nombre) => {
                if (nombre === 'Conversión de la landing') return [v == null ? 'sin dato' : `${String(v).replace('.', ',')}%`, nombre]
                if (nombre === 'Inversión') return [usd(Number(v)), nombre]
                return [v as number, nombre]
              }}
              labelFormatter={l => String(l)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="n" dataKey="solicitudes" name={embudo === 'clase' ? 'Registros' : 'Solicitudes'} fill="var(--brand)" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="n" dataKey="realizadas" name="Tasaciones realizadas" fill="color-mix(in oklab, var(--brand) 40%, transparent)" radius={[3, 3, 0, 0]} />
            <Line yAxisId="p" dataKey="conversionPct" name="Conversión de la landing" stroke="#b45309" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
            {hitos.map(h => {
              const x = etiquetaDe.get(clave(h.fecha, agrupar))
              return x ? <ReferenceLine key={h.id} yAxisId="n" x={x} stroke="var(--muted-foreground)" strokeDasharray="4 3" label={{ value: '●', position: 'top', fontSize: 10 }} /> : null
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hitos.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {hitos.map(h => <li key={h.id}><span className="tabular-n">{fechaCorta(h.fecha)}</span> · {h.titulo}{h.detalle ? ` — ${h.detalle}` : ''}</li>)}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-n">
          <thead><tr className="text-muted-foreground border-b">
            <th className="text-left font-normal py-1 pr-2">Período</th><th className="text-right font-normal px-2">Inversión</th><th className="text-right font-normal px-2">Visitas</th>
            <th className="text-right font-normal px-2">{embudo === 'clase' ? 'Registros' : 'Solicitudes'}</th><th className="text-right font-normal px-2">Conversión</th><th className="text-right font-normal px-2">Costo c/u</th>
            <th className="text-right font-normal px-2">Agendadas</th><th className="text-right font-normal px-2">Realizadas</th><th className="text-right font-normal pl-2">Captadas</th>
          </tr></thead>
          <tbody>
            {datos.map(d => (
              <tr key={d.clave} className="border-b last:border-0">
                <td className="py-1 pr-2">{d.etiqueta}</td><td className="text-right px-2">{d.inversionUsd ? usd(d.inversionUsd) : '—'}</td>
                <td className="text-right px-2">{d.visitas ?? 'sin dato'}</td><td className="text-right px-2">{d.solicitudes}</td>
                <td className="text-right px-2">{pct(d.conversion)}</td><td className="text-right px-2">{d.costoSolicitud == null ? '—' : usd(d.costoSolicitud, 1)}</td>
                <td className="text-right px-2">{d.agendadas}</td><td className="text-right px-2">{d.realizadas}</td><td className="text-right pl-2">{d.captadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts'
import type { FunnelMetrics } from '@/lib/metrics/types'

const STAGES: Array<{ key: keyof FunnelMetrics; label: string }> = [
  { key: 'appraisal_requests',     label: 'Solicitudes de tasación' },
  { key: 'appointments_scheduled', label: 'Tasaciones agendadas' },
  { key: 'visits_completed',       label: 'Visitas realizadas' },
  { key: 'appraisals_delivered',   label: 'Tasaciones entregadas' },
  { key: 'properties_captured',    label: 'Propiedades captadas' },
]

const COLOR = '#2A3B84' // brand

export function FunnelChart({ metrics }: { metrics: FunnelMetrics }) {
  const data = STAGES.map((s, i) => {
    const value = metrics[s.key]
    const prevValue = i === 0 ? value : metrics[STAGES[i - 1].key]
    const conversionPct = i === 0
      ? null
      : prevValue > 0 ? Math.round((value / prevValue) * 100) : 0
    return {
      stage: s.label,
      value,
      conversionPct,
      fill: COLOR,
      fillOpacity: 1 - (i * 0.12), // tono cada vez más claro hacia el fondo del embudo
    }
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 8 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="stage" width={180} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={((v: unknown, _name: unknown, ctx: unknown) => {
            const payload = (ctx as { payload?: { conversionPct?: number | null } })?.payload
            const conv = payload?.conversionPct
            const suffix = conv == null ? '(inicio)' : `(${conv}% vs etapa anterior)`
            return [`${v} ${suffix}`, 'Cantidad']
          }) as never}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} fillOpacity={d.fillOpacity} />
          ))}
          <LabelList dataKey="value" position="right" style={{ fontSize: 13, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

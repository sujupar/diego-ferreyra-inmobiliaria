'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import type { FunnelDayRow } from '@/lib/metrics/types'

const SERIES: Array<{ key: keyof Omit<FunnelDayRow, 'day'>; label: string; color: string }> = [
  { key: 'appraisal_requests',     label: 'Solicitudes',      color: '#2A3B84' },
  { key: 'appointments_scheduled', label: 'Agendadas',        color: '#0EA5E9' },
  { key: 'visits_completed',       label: 'Visitas',          color: '#10B981' },
  { key: 'appraisals_delivered',   label: 'Entregadas',       color: '#F59E0B' },
  { key: 'properties_captured',    label: 'Captadas',         color: '#DC2626' },
]

function fmtDay(d: string): string {
  // YYYY-MM-DD → DD/MM
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

export function FunnelByDayChart({ rows }: { rows: FunnelDayRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos para el rango.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0fb" />
        <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip labelFormatter={((d: unknown) => fmtDay(String(d))) as never} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SERIES.map(s => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

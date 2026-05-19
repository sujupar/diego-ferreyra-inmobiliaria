'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'

export interface DateRange { from: string; to: string }

type PresetKey = 'yesterday' | '7d' | '30d' | 'month_to_date' | 'last_month' | 'custom'

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'yesterday',     label: 'Ayer' },
  { key: '7d',            label: '7 días' },
  { key: '30d',           label: '30 días' },
  { key: 'month_to_date', label: 'Mes corriente' },
  { key: 'last_month',    label: 'Mes anterior' },
  { key: 'custom',        label: 'Personalizado' },
]

function presetToRange(key: PresetKey, today = new Date()): DateRange | null {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  if (key === 'yesterday') {
    const y = new Date(t); y.setUTCDate(y.getUTCDate() - 1)
    return { from: fmt(y), to: fmt(y) }
  }
  if (key === '7d') {
    const to = new Date(t); to.setUTCDate(to.getUTCDate() - 1)
    const from = new Date(to); from.setUTCDate(from.getUTCDate() - 6)
    return { from: fmt(from), to: fmt(to) }
  }
  if (key === '30d') {
    const to = new Date(t); to.setUTCDate(to.getUTCDate() - 1)
    const from = new Date(to); from.setUTCDate(from.getUTCDate() - 29)
    return { from: fmt(from), to: fmt(to) }
  }
  if (key === 'month_to_date') {
    const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))
    return { from: fmt(from), to: fmt(t) }
  }
  if (key === 'last_month') {
    const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))
    const to = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0))
    return { from: fmt(from), to: fmt(to) }
  }
  return null
}

interface Props {
  value: DateRange
  onChange: (r: DateRange) => void
  defaultPreset?: PresetKey
}

export function DateRangePicker({ value, onChange, defaultPreset = '7d' }: Props) {
  const [preset, setPreset] = useState<PresetKey>(defaultPreset)

  const apply = (key: PresetKey) => {
    setPreset(key)
    if (key === 'custom') return
    const r = presetToRange(key)
    if (r) onChange(r)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <button
          key={p.key}
          type="button"
          onClick={() => apply(p.key)}
          className={`px-3 py-1.5 text-sm rounded-md border transition ${
            preset === p.key
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-foreground border-input hover:bg-muted'
          }`}
        >{p.label}</button>
      ))}
      {preset === 'custom' && (
        <div className="flex items-center gap-2 ml-2">
          <Input
            type="date"
            value={value.from}
            onChange={e => onChange({ ...value, from: e.target.value })}
            className="w-auto"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            value={value.to}
            onChange={e => onChange({ ...value, to: e.target.value })}
            className="w-auto"
          />
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DateRangeFilterProps {
  onChange: (range: { from: string; to: string }) => void
}

function toISO(d: Date) { return d.toISOString().split('T')[0] }

const PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: 'Ayer', days: 1 },
  { label: '7d', days: 7 },
  { label: '15d', days: 15 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const

export function DateRangeFilter({ onChange }: DateRangeFilterProps) {
  const [active, setActive] = useState<string>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  function handlePreset(label: string, days: number) {
    const to = new Date()
    const from = new Date()
    if (days === 0) {
      // Today
    } else if (days === 1) {
      from.setDate(from.getDate() - 1)
      to.setDate(to.getDate() - 1)
    } else {
      from.setDate(from.getDate() - days)
    }
    setActive(label)
    setShowCustom(false)
    onChange({ from: toISO(from), to: toISO(to) })
  }

  function handleAll() {
    setActive('')
    setShowCustom(false)
    onChange({ from: '', to: '' })
  }

  function handleCustomApply() {
    if (customFrom && customTo) {
      setActive('custom')
      onChange({ from: customFrom, to: customTo })
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex gap-1 flex-wrap">
        <Button variant={active === '' ? 'default' : 'outline'} size="sm" onClick={handleAll}>
          Todo
        </Button>
        {PRESETS.map(p => (
          <Button key={p.label} variant={active === p.label ? 'default' : 'outline'} size="sm" onClick={() => handlePreset(p.label, p.days)}>
            {p.label}
          </Button>
        ))}
        <Button variant={active === 'custom' || showCustom ? 'default' : 'outline'} size="sm" onClick={() => setShowCustom(!showCustom)}>
          Custom
        </Button>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2">
          <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-36 h-8 text-sm" />
          <span className="text-muted-foreground text-sm">—</span>
          <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-36 h-8 text-sm" />
          <Button size="sm" onClick={handleCustomApply} className="h-8">Aplicar</Button>
        </div>
      )}
    </div>
  )
}

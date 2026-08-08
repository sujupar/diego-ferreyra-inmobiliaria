'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DateRangeFilterProps {
  onChange: (range: { from: string; to: string }) => void
  value?: { from: string; to: string }
}

// Devuelve la fecha LOCAL en formato ISO (YYYY-MM-DD)
// Usa getFullYear/getMonth/getDate que dan local time, no UTC
function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: 'Ayer', days: 1 },
  { label: '7d', days: 7 },
  { label: '15d', days: 15 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const

function getPresetRange(days: number) {
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
  return { from: toISO(from), to: toISO(to) }
}

export function DateRangeFilter({ onChange, value }: DateRangeFilterProps) {
  const [active, setActive] = useState<string>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  // Cuando hay value controlado, derivar el preset activo y los valores de los inputs
  const derivedState = useMemo(() => {
    if (!value) return { activePreset: active, inputFrom: customFrom, inputTo: customTo }

    // Si value es vacío, ningún preset está activo
    if (!value.from && !value.to) return { activePreset: '', inputFrom: '', inputTo: '' }

    // Buscar si value coincide con algún preset
    for (const p of PRESETS) {
      const presetRange = getPresetRange(p.days)
      if (presetRange.from === value.from && presetRange.to === value.to) {
        return { activePreset: p.label, inputFrom: value.from, inputTo: value.to }
      }
    }

    // Si no coincide con ningún preset, es un rango custom
    return { activePreset: 'custom', inputFrom: value.from, inputTo: value.to }
  }, [value, active, customFrom, customTo])

  const currentActive = value !== undefined ? derivedState.activePreset : active
  // Los inputs custom siempre usan el borrador local, nunca el value prop
  // El value solo se usa para determinar qué preset está activo
  const currentCustomFrom = customFrom
  const currentCustomTo = customTo

  // Precarga el borrador cuando value es un rango custom (no matchea preset)
  useEffect(() => {
    if (value && derivedState.activePreset === 'custom') {
      setCustomFrom(value.from)
      setCustomTo(value.to)
    }
  }, [value?.from, value?.to, derivedState.activePreset])

  function handlePreset(label: string, days: number) {
    const range = getPresetRange(days)
    // Si es no controlado, actualizar el estado local
    if (!value) {
      setActive(label)
      setShowCustom(false)
    }
    onChange(range)
  }

  function handleAll() {
    // Si es no controlado, actualizar el estado local
    if (!value) {
      setActive('')
      setShowCustom(false)
    }
    onChange({ from: '', to: '' })
  }

  function handleCustomApply() {
    if (currentCustomFrom && currentCustomTo) {
      // Si es no controlado, actualizar el estado local
      if (!value) {
        setActive('custom')
      }
      onChange({ from: currentCustomFrom, to: currentCustomTo })
    }
  }

  function handleCustomChange(type: 'from' | 'to', newValue: string) {
    // El estado de los inputs custom es un BORRADOR local y debe funcionar siempre
    if (type === 'from') {
      setCustomFrom(newValue)
    } else {
      setCustomTo(newValue)
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex gap-1 flex-wrap">
        <Button
          variant={currentActive === '' ? 'default' : 'outline'}
          size="sm"
          onClick={handleAll}
          aria-pressed={currentActive === ''}
        >
          Todo
        </Button>
        {PRESETS.map(p => (
          <Button
            key={p.label}
            variant={currentActive === p.label ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset(p.label, p.days)}
            aria-pressed={currentActive === p.label}
          >
            {p.label}
          </Button>
        ))}
        <Button
          variant={currentActive === 'custom' || showCustom ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowCustom(!showCustom)}
          aria-pressed={currentActive === 'custom' || showCustom}
        >
          Custom
        </Button>
      </div>
      {(showCustom || currentActive === 'custom') && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={currentCustomFrom}
            onChange={e => handleCustomChange('from', e.target.value)}
            className="w-36 h-8 text-sm"
          />
          <span className="text-muted-foreground text-sm">—</span>
          <Input
            type="date"
            value={currentCustomTo}
            onChange={e => handleCustomChange('to', e.target.value)}
            className="w-36 h-8 text-sm"
          />
          <Button size="sm" onClick={handleCustomApply} className="h-8">Aplicar</Button>
        </div>
      )}
    </div>
  )
}

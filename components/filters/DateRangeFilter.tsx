'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DateRangeFilterProps {
  onChange: (range: { from: string; to: string }) => void
  value?: { from: string; to: string }
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
  const currentCustomFrom = value !== undefined ? derivedState.inputFrom : customFrom
  const currentCustomTo = value !== undefined ? derivedState.inputTo : customTo

  function handlePreset(label: string, days: number) {
    const range = getPresetRange(days)
    if (!value) {
      setActive(label)
      setShowCustom(false)
    }
    onChange(range)
  }

  function handleAll() {
    if (!value) {
      setActive('')
      setShowCustom(false)
    }
    onChange({ from: '', to: '' })
  }

  function handleCustomApply() {
    if (currentCustomFrom && currentCustomTo) {
      if (!value) {
        setActive('custom')
      }
      onChange({ from: currentCustomFrom, to: currentCustomTo })
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
          onClick={() => {
            if (!value) {
              setShowCustom(!showCustom)
            } else {
              // Con value controlado, solo cambiar la visibilidad
              setShowCustom(!showCustom)
            }
          }}
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
            onChange={e => {
              if (!value) {
                setCustomFrom(e.target.value)
              }
            }}
            className="w-36 h-8 text-sm"
          />
          <span className="text-muted-foreground text-sm">—</span>
          <Input
            type="date"
            value={currentCustomTo}
            onChange={e => {
              if (!value) {
                setCustomTo(e.target.value)
              }
            }}
            className="w-36 h-8 text-sm"
          />
          {!value && (
            <Button size="sm" onClick={handleCustomApply} className="h-8">Aplicar</Button>
          )}
        </div>
      )}
    </div>
  )
}

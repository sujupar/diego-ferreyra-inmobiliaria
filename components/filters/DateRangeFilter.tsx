'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
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

  // A2, segunda mitad: "Limpiar todo" (y cualquier otro cambio de rango que NO
  // pase por los botones de acá — un deep link, el historial del navegador)
  // llega solo como un `value` nuevo desde afuera. Sin esto, el panel custom
  // quedaba abierto con un borrador que ya no aplica a nada.
  //
  // El guard por REF es lo que hace que esto no sea una jaula: el efecto actúa
  // únicamente cuando `value` CAMBIÓ. Cerrar el panel en cada render con
  // `activePreset !== 'custom'` haría imposible abrirlo (al abrirlo el rango
  // vigente todavía es el preset anterior, y se cerraría en el acto).
  const valorPrevioRef = useRef(value)
  useEffect(() => {
    const previo = valorPrevioRef.current
    valorPrevioRef.current = value
    if (!value || !previo) return
    if (previo.from === value.from && previo.to === value.to) return
    // El rango cambió desde afuera: si el nuevo no es un rango custom, el panel
    // no tiene nada que editar.
    if (derivedState.activePreset !== 'custom') setShowCustom(false)
  }, [value?.from, value?.to, derivedState.activePreset])

  // Ronda final de la Fase 2 — A2: cerrar el panel custom NO es "estado local
  // del modo no controlado". Es la respuesta visual a "ya no estás en custom", y
  // vale en los dos modos. Cuando esto se escribió ninguna pantalla pasaba
  // `value`; hoy las CINCO lo pasan, así que el `setShowCustom(false)` que vivía
  // adentro del `if (!value)` no corría nunca en la app real: elegir un preset
  // dejaba DOS botones con aria-pressed=true (el preset y "Custom") y los inputs
  // de fecha en pantalla con el borrador viejo adentro.
  function handlePreset(label: string, days: number) {
    const range = getPresetRange(days)
    // El preset activo sí es estado local solo del modo no controlado: con
    // `value`, lo deriva `derivedState`.
    if (!value) setActive(label)
    setShowCustom(false)
    onChange(range)
  }

  function handleAll() {
    if (!value) setActive('')
    setShowCustom(false)
    onChange({ from: '', to: '' })
  }

  // Con UNA sola punta cargada, "Aplicar" no hacía absolutamente nada: ni
  // filtraba, ni avisaba, ni se veía deshabilitado — indistinguible de un botón
  // roto. Y el rango abierto ("todo lo captado a partir del 1 de agosto") es un
  // pedido normal que el resto del sistema YA soporta: la consulta aplica
  // `from` y `to` con ifs independientes, y las cinco pantallas validan cada
  // punta por separado. El bloqueo era solo de este control.
  const hayAlgoQueAplicar = !!(currentCustomFrom || currentCustomTo)

  function handleCustomApply() {
    if (hayAlgoQueAplicar) {
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
          {/* Sin NINGUNA punta cargada no hay nada que aplicar, y eso el botón
              lo tiene que DECIR (deshabilitado) en vez de tragarse el clic. */}
          <Button
            size="sm"
            onClick={handleCustomApply}
            disabled={!hayAlgoQueAplicar}
            title={hayAlgoQueAplicar ? undefined : 'Cargá al menos una de las dos fechas'}
            className="h-8"
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  )
}

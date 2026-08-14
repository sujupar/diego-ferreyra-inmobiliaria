'use client'

import { useRef, useState } from 'react'
import { Loader2, Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sanearEdicion } from '@/lib/properties/editable-fields'

export interface CaracteristicasEditables {
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  garages?: number | null
  covered_area?: number | null
  total_area?: number | null
  age?: number | null
  floor?: number | null
  expensas?: number | null
  description?: string | null
}

interface Props {
  propertyId: string
  valores: CaracteristicasEditables
  onChanged: () => void
}

const CAMPOS: { id: keyof CaracteristicasEditables; label: string; sufijo?: string }[] = [
  { id: 'rooms', label: 'Ambientes' },
  { id: 'bedrooms', label: 'Dormitorios' },
  { id: 'bathrooms', label: 'Baños' },
  { id: 'garages', label: 'Cocheras' },
  { id: 'covered_area', label: 'Superficie cubierta', sufijo: 'm²' },
  { id: 'total_area', label: 'Superficie total', sufijo: 'm²' },
  { id: 'age', label: 'Antigüedad', sufijo: 'años' },
  { id: 'floor', label: 'Piso' },
  { id: 'expensas', label: 'Expensas', sufijo: 'ARS' },
]

/**
 * Panel para corregir las características de la propiedad.
 *
 * Se guarda solo, SIN botón de guardar, al salir de cada campo. NO por
 * temporizador desde la última tecla, que fue el primer diseño y estaba mal:
 * para corregir 6 → 5 hay que vaciar el campo, y un guardado por tiempo puede
 * dispararse justo ahí y dejar el dato en blanco. Con la landing pública
 * leyendo estos valores en vivo, ese instante se ve. Misma regla que el precio:
 * el estado intermedio de un campo nunca se publica.
 */
export function PropertyDetailsEditor({ propertyId, valores, onChanged }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState<Record<string, string>>(() => aTexto(valores))
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>('quieto')
  const [error, setError] = useState<string | null>(null)
  const inicial = useRef<Record<string, string>>(aTexto(valores))

  /**
   * Manda UN campo. `crudo` es lo que quedó escrito: solo se marca como
   * guardado si el servidor confirmó. Si se marcara antes, un guardado fallido
   * dejaría el campo con el valor viejo en la base y el panel creyendo que ya
   * está: volver a salir del campo no reintentaría nada.
   */
  async function enviar(campo: string, crudo: string, valor: unknown) {
    const saneado = sanearEdicion({ [campo]: valor })
    if (!saneado.ok) { setError(saneado.error); setEstado('quieto'); return }
    setError(null)
    setEstado('guardando')
    try {
      const res = await fetch(`/api/properties/${propertyId}/details`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(saneado.patch),
      })
      const cuerpo = await res.json().catch(() => ({}))
      if (!res.ok) { setError(cuerpo.error ?? 'No se pudo guardar el cambio.'); setEstado('quieto'); return }
      inicial.current = { ...inicial.current, [campo]: crudo }
      setEstado('guardado')
      onChanged()
      setTimeout(() => setEstado('quieto'), 2000)
    } catch {
      setError('No se pudo guardar el cambio. Revisá la conexión y probá de nuevo.')
      setEstado('quieto')
    }
  }

  function escribir(campo: string, crudo: string) {
    setBorrador(b => ({ ...b, [campo]: crudo }))
    setError(null)
  }

  /** Al salir del campo: si cambió respecto de lo guardado, se manda. */
  function confirmar(campo: string) {
    const crudo = borrador[campo] ?? ''
    if (crudo === (inicial.current[campo] ?? '')) return // sin cambio real
    const valor = crudo === '' ? null : campo === 'description' ? crudo : Number(crudo)
    enviar(campo, crudo, valor)
  }

  /** Cierra el panel guardando lo que esté enfocado (el blur corre antes). */
  function cerrar() {
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <Button variant="outline" size="sm" className="mt-4" onClick={() => setAbierto(true)}>
        <Pencil className="h-3.5 w-3.5 mr-1.5" />Editar características
      </Button>
    )
  }

  return (
    <div className="mt-4 rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="eyebrow">Editar características</p>
        <div className="flex items-center gap-3">
          {estado === 'guardando' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Guardando…
            </span>
          )}
          {estado === 'guardado' && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3 w-3" />Guardado
            </span>
          )}
          <button
            type="button"
            onClick={cerrar}
            className="text-xs text-muted-foreground underline"
          >
            Listo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CAMPOS.map(c => (
          <label key={c.id} className="space-y-1">
            <span className="text-xs text-muted-foreground">
              {c.label}{c.sufijo ? ` (${c.sufijo})` : ''}
            </span>
            <input
              type="number"
              inputMode="numeric"
              aria-label={c.label}
              value={borrador[c.id] ?? ''}
              onChange={e => escribir(c.id, e.target.value)}
              onBlur={() => confirmar(c.id)}
              className="w-full rounded-md border px-2.5 py-1.5 text-sm tabular-n"
            />
          </label>
        ))}
      </div>

      <label className="block mt-3 space-y-1">
        <span className="text-xs text-muted-foreground">Descripción</span>
        <textarea
          aria-label="Descripción"
          rows={5}
          value={borrador.description ?? ''}
          onChange={e => escribir('description', e.target.value)}
          onBlur={() => confirmar('description')}
          className="w-full rounded-md border px-3 py-2 text-sm leading-relaxed"
        />
      </label>

      {error && <p className="mt-2 text-sm text-[color:var(--destructive)]">{error}</p>}

      <p className="mt-3 text-xs text-muted-foreground">
        Si la propiedad tiene landing publicada, estos datos se actualizan solos ahí; los
        textos que ya escribió la IA no se reescriben. Los avisos ya publicados en los
        portales no se actualizan solos.
      </p>
    </div>
  )
}

function aTexto(v: CaracteristicasEditables): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of CAMPOS) {
    const val = v[c.id]
    out[c.id] = val == null ? '' : String(val)
  }
  out.description = v.description ?? ''
  return out
}

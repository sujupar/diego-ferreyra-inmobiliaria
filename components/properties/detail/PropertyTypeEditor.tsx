'use client'
/**
 * Editor del TIPO de propiedad (ficha). Se puede corregir si quedó mal cargado
 * (afecta el texto de los anuncios de campaña). Usa el endpoint dedicado
 * POST /api/properties/[id]/property-type (sin efectos secundarios del PUT).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, propertyTypeLabel } from '@/lib/properties/property-type'

export function PropertyTypeEditor({ propertyId, current, onChanged }: {
  propertyId: string
  current: string
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const known = (PROPERTY_TYPES as readonly string[]).includes(current)

  async function change(next: string) {
    if (!next || next === current) return
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/property-type`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ propertyType: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo cambiar el tipo')
      toast.success(`Tipo cambiado a ${propertyTypeLabel(next)}`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="eyebrow flex items-center gap-1">Tipo {saving && <Loader2 className="h-3 w-3 animate-spin" />}</p>
      <select
        value={known ? current : ''}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        aria-label="Tipo de propiedad"
        className="mt-0.5 w-full cursor-pointer bg-transparent text-sm font-medium outline-none disabled:opacity-60"
      >
        {!known && <option value="">{propertyTypeLabel(current)}</option>}
        {PROPERTY_TYPES.map((t) => (
          <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
        ))}
      </select>
    </div>
  )
}

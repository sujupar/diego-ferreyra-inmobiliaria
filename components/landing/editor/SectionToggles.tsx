'use client'
/**
 * E1.6 Editor — mostrar/ocultar las secciones OPCIONALES (galería, planos, ubicación).
 * No toca hero/stats/historia/CTAs/pie (la estructura de lujo + los CTAs quedan fijos).
 * Planos sólo se ofrece si la propiedad tiene planos; galería si tiene ≥3 fotos.
 */
import type { LandingDocument } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { TOGGLEABLE } from '@/lib/landing/editor/editable'
import { Switch } from '@/components/ui/switch'

export function SectionToggles({ doc, property, onToggle }: {
  doc: LandingDocument; property: LandingProperty; onToggle: (id: string, on: boolean) => void
}) {
  const present = new Set(doc.blocks.map((b) => b.id))
  const hasPlans = ((property as { plans?: string[] | null }).plans ?? []).length > 0
  const hasPhotos = (property.photos ?? []).length >= 3

  const rows = TOGGLEABLE.filter((t) => {
    if (t.id === 'plans') return hasPlans
    if (t.id === 'gallery') return hasPhotos
    return true
  })
  if (rows.length === 0) return null

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Secciones</p>
      {rows.map((t) => (
        <label key={t.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{t.label}</span>
          <Switch checked={present.has(t.id)} onCheckedChange={(on) => onToggle(t.id, on)} />
        </label>
      ))}
    </div>
  )
}

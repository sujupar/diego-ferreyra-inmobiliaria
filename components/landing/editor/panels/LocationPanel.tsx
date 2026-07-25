'use client'
/** E1.6 Editor — panel de la ubicación (banda de marca con copy de zona, sin mapa). */
import type { LandingBlock } from '@/lib/landing/schema'
import { Field } from './Field'

type Loc = Extract<LandingBlock, { type: 'location_showcase' }>

export function LocationPanel({ block, onChange }: { block: Loc; onChange: (b: Loc) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Ubicación</h3>
      <Field label="Antetítulo" value={block.eyebrow ?? ''} maxKey="location.eyebrow"
        onChange={(v) => onChange({ ...block, eyebrow: v })} />
      <Field label="Título" value={block.title ?? ''} maxKey="location.title"
        onChange={(v) => onChange({ ...block, title: v })} />
      <Field label="Texto de la zona" value={block.body ?? ''} maxKey="location.body" multiline
        onChange={(v) => onChange({ ...block, body: v })} />
    </div>
  )
}

'use client'
/** E1.6 Editor — panel de las invitaciones/CTA (cta-mid y closing). `headline` es
 *  requerido: si el asesor lo vacía, conservamos el último valor no vacío para no
 *  romper el Zod al guardar. */
import type { LandingBlock } from '@/lib/landing/schema'
import { Field } from './Field'

type Closing = Extract<LandingBlock, { type: 'closing_invite' }>

export function ClosingPanel({ block, onChange }: { block: Closing; onChange: (b: Closing) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Invitación / CTA</h3>
      <Field label="Antetítulo" value={block.eyebrow ?? ''} maxKey="closing.eyebrow"
        onChange={(v) => onChange({ ...block, eyebrow: v })} />
      <Field label="Título" value={block.headline} maxKey="closing.headline" multiline
        onChange={(v) => onChange({ ...block, headline: v || block.headline })} />
      <Field label="Texto" value={block.body ?? ''} maxKey="closing.body" multiline
        onChange={(v) => onChange({ ...block, body: v })} />
      <Field label="Texto del botón" value={block.ctaLabel ?? ''} maxKey="ctaLabel"
        onChange={(v) => onChange({ ...block, ctaLabel: v })} />
      <p className="text-[11px] text-muted-foreground">El título no puede quedar vacío (es la invitación principal).</p>
    </div>
  )
}

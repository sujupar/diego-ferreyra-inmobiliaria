'use client'
/** E1.6 Editor — panel de la portada (hero): textos + foto de portada. */
import type { LandingBlock } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { Field } from './Field'
import { PhotoPicker } from '../PhotoPicker'

type Hero = Extract<LandingBlock, { type: 'hero' }>

export function HeroPanel({ block, property, onChange }: {
  block: Hero; property: LandingProperty; onChange: (b: Hero) => void
}) {
  const photos = property.photos ?? []
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Portada</h3>
      <Field label="Titular" value={block.titleOverride ?? ''} maxKey="titleOverride" multiline
        onChange={(v) => onChange({ ...block, titleOverride: v })} />
      <Field label="Subtítulo" value={block.subtitle ?? ''} maxKey="subtitle" multiline
        onChange={(v) => onChange({ ...block, subtitle: v })} />
      <Field label="Etiqueta del precio" value={block.offerLabel ?? ''} maxKey="offerLabel"
        onChange={(v) => onChange({ ...block, offerLabel: v })} />
      <Field label="Texto del botón" value={block.ctaLabel ?? ''} maxKey="ctaLabel"
        onChange={(v) => onChange({ ...block, ctaLabel: v })} />
      {photos.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Foto de portada</span>
          <PhotoPicker mode="single" photos={photos} value={block.heroPhotoIndex ?? 0}
            onPick={(i) => onChange({ ...block, heroPhotoIndex: i })} />
        </div>
      )}
    </div>
  )
}

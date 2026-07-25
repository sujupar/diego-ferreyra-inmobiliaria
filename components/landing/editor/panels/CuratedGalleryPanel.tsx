'use client'
/** E1.6 Editor — panel de la galería: textos + selección/orden de fotos. */
import type { LandingBlock } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { Field } from './Field'
import { PhotoPicker } from '../PhotoPicker'

type Gallery = Extract<LandingBlock, { type: 'curated_gallery' }>

export function CuratedGalleryPanel({ block, property, onChange }: {
  block: Gallery; property: LandingProperty; onChange: (b: Gallery) => void
}) {
  const photos = property.photos ?? []
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Galería</h3>
      <Field label="Antetítulo" value={block.eyebrow ?? ''} maxKey="gallery.eyebrow"
        onChange={(v) => onChange({ ...block, eyebrow: v })} />
      <Field label="Título" value={block.title ?? ''} maxKey="gallery.title"
        onChange={(v) => onChange({ ...block, title: v })} />
      {photos.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Fotos de la galería</span>
          <PhotoPicker mode="multi" photos={photos}
            value={block.photoIndices ?? photos.map((_, i) => i)}
            onReorder={(indices) => onChange({ ...block, photoIndices: indices })} />
        </div>
      )}
    </div>
  )
}

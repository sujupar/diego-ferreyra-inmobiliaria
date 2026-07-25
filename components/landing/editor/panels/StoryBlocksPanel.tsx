'use client'
/** E1.6 Editor — panel de la historia: textos + foto de cada uno de los bloques. */
import type { LandingBlock } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { patchStoryItem } from '@/lib/landing/editor/block-patch'
import { Field } from './Field'
import { PhotoPicker } from '../PhotoPicker'

type Story = Extract<LandingBlock, { type: 'story_blocks' }>

export function StoryBlocksPanel({ block, property, onChange }: {
  block: Story; property: LandingProperty; onChange: (b: Story) => void
}) {
  const photos = property.photos ?? []
  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold">Historia</h3>
      {block.items.map((it, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3">
          <p className="text-xs font-semibold text-muted-foreground">Bloque {it.numeral}</p>
          <Field label="Antetítulo" value={it.eyebrow} maxKey="story.eyebrow"
            onChange={(v) => onChange(patchStoryItem(block, i, { eyebrow: v }))} />
          <Field label="Título" value={it.headline} maxKey="story.headline" multiline
            onChange={(v) => onChange(patchStoryItem(block, i, { headline: v }))} />
          <Field label="Texto" value={it.body} maxKey="story.body" multiline
            onChange={(v) => onChange(patchStoryItem(block, i, { body: v }))} />
          {photos.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Foto</span>
              <PhotoPicker mode="single" photos={photos} value={it.photoIndex ?? 0}
                onPick={(idx) => onChange(patchStoryItem(block, i, { photoIndex: idx }))} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

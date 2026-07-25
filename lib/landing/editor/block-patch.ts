/**
 * E1.6 Editor — reemplazo/patch de bloques por id (inmutable), preservando orden.
 */
import type { LandingBlock } from '@/lib/landing/schema'

export function replaceBlockById(blocks: LandingBlock[], id: string, next: LandingBlock): LandingBlock[] {
  return blocks.map((b) => (b.id === id ? next : b))
}

type StoryBlock = Extract<LandingBlock, { type: 'story_blocks' }>

export function patchStoryItem(
  block: StoryBlock,
  index: number,
  patch: Partial<{ eyebrow: string; headline: string; body: string; photoIndex: number }>,
): StoryBlock {
  const items = block.items.map((it, i) => (i === index ? { ...it, ...patch } : it))
  return { ...block, items }
}

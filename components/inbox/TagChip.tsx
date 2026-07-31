import { X } from 'lucide-react'
import { colorForTag } from '@/lib/leads/tags'
import { cn } from '@/lib/utils'
import type { LeadTagRef } from './types'

/** Una etiqueta de colores, chica, para filas de lista y cabeceras. */
export function TagChip({
  tag,
  className,
  onRemove,
}: {
  tag: LeadTagRef
  className?: string
  /** Si se pasa, muestra una "×" — usado en el editor del panel del cliente (task 6). */
  onRemove?: () => void
}) {
  const c = colorForTag(tag.color)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        c.bg,
        c.text,
        c.border,
        className,
      )}
    >
      {tag.label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full opacity-60 hover:opacity-100"
          aria-label={`Quitar etiqueta ${tag.label}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}

/** Fila de chips con overflow "+N" — usado en `ConversationRow` y `ThreadHeader` para no romper el layout con muchas etiquetas. */
export function TagChipList({ tags, max = 3, className }: { tags: LeadTagRef[]; max?: number; className?: string }) {
  if (tags.length === 0) return null
  const visible = tags.slice(0, max)
  const overflow = tags.length - visible.length
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map(t => (
        <TagChip key={t.slug} tag={t} />
      ))}
      {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}</span>}
    </div>
  )
}

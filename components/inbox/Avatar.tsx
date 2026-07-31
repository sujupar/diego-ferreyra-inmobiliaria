import { initialsAndColor } from '@/lib/leads/tags'
import { cn } from '@/lib/utils'

/**
 * Avatar circular con iniciales y color estable por persona (task 4/5/6).
 * Toda la lógica de color/iniciales vive en `lib/leads/tags.ts#initialsAndColor`
 * (task 1) — acá solo se dibuja. Deliberadamente NO usa `components/ui/avatar.tsx`
 * (ese es para imagen+fallback estilo shadcn; acá siempre es un círculo de
 * color sólido, sin imagen — es justamente el elemento que tomamos de la
 * referencia "Cota").
 */

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-14 w-14 text-lg',
} as const

export type AvatarSize = keyof typeof SIZE_CLASSES

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string | null | undefined
  size?: AvatarSize
  className?: string
}) {
  const { initials, bg, text } = initialsAndColor(name)
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        SIZE_CLASSES[size],
        bg,
        text,
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

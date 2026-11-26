'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Opción grande para elegir (maqueta `.opcion`): un toque = elegir. 52 px de alto en
// táctil, 44 px con mouse; letra de 15 px en táctil y 14 px con mouse.
export function OpcionGrande({
  Icono,
  presionada,
  onClick,
  children,
  extra,
  disabled,
  ref,
  className,
  ...resto
}: {
  Icono: LucideIcon
  presionada?: boolean
  onClick?: () => void
  children: React.ReactNode
  extra?: React.ReactNode
  disabled?: boolean
  ref?: React.Ref<HTMLButtonElement>
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={presionada ?? false}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group flex w-full min-h-13 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2 text-left text-[15px] font-medium leading-tight',
        'raton:min-h-11 raton:text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-60',
        'aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand aria-pressed:shadow-[inset_0_0_0_1px_var(--brand)]',
        'outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
      {...resto}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary group-aria-pressed:bg-brand group-aria-pressed:text-brand-foreground">
        <Icono aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {extra}
    </button>
  )
}

'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface BulkAction {
  label: string
  icon?: React.ReactNode
  variant?: 'default' | 'destructive' | 'outline' | 'ghost'
  onClick: () => void
  disabled?: boolean
}

export function BulkActionsBar({
  count,
  onClear,
  actions,
  noun = 'elementos',
}: {
  count: number
  onClear: () => void
  actions: BulkAction[]
  noun?: string
}) {
  if (count === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {count} {noun} seleccionado{count !== 1 ? 's' : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-muted-foreground">
          <X className="h-3.5 w-3.5 mr-1" /> Cancelar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <Button key={i} variant={a.variant || 'outline'} size="sm" onClick={a.onClick} disabled={a.disabled}>
            {a.icon}
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

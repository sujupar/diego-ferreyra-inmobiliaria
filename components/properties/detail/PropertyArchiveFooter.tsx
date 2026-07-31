'use client'

import { Loader2, Archive, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  createdAt: string
  isDiscarded: boolean
  canHardDelete: boolean
  submitting: boolean
  onDiscard: () => void
  onRestore: () => void
  onDelete: () => void
}

/**
 * Franja discreta al pie. Reemplaza la tarjeta punteada grande de la versión
 * anterior — mismas acciones y mismas confirmaciones.
 */
export function PropertyArchiveFooter({
  createdAt, isDiscarded, canHardDelete, submitting, onDiscard, onRestore, onDelete,
}: Props) {
  return (
    <div className="border-t pt-4 mt-10 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>Creada el {new Date(createdAt).toLocaleDateString('es-AR')}</span>
      <div className="flex flex-wrap items-center gap-2">
        {isDiscarded ? (
          <Button variant="ghost" size="sm" onClick={onRestore} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
            Restaurar a borrador
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
            Descartar
          </Button>
        )}
        {canHardDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={submitting}
            className="text-[color:var(--destructive)] hover:text-[color:var(--destructive)]"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Eliminar definitivamente
          </Button>
        )}
      </div>
    </div>
  )
}

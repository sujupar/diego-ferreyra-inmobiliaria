'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  createdAt: string
  canHardDelete: boolean
  submitting: boolean
  onDelete: () => void
}

/**
 * Franja discreta al pie. Descartar y restaurar dejaron de vivir acá: ahora son
 * estados de la tarjeta "Estado de la propiedad" (2026-08-06). Eliminar se queda
 * porque es otra cosa: borra la propiedad de la base, no cambia su estado.
 */
export function PropertyArchiveFooter({ createdAt, canHardDelete, submitting, onDelete }: Props) {
  return (
    <div className="border-t pt-4 mt-10 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>Creada el {new Date(createdAt).toLocaleDateString('es-AR')}</span>
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
  )
}

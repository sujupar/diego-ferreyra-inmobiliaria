'use client'

import Link from 'next/link'
import { ArrowLeft, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from './Avatar'
import { TagChipList } from './TagChip'
import { PipelineStateChip } from './PipelineStateChip'
import { displayPhone } from './format'
import type { LeadTagRef } from './types'

/**
 * Cabecera del hilo (task 5): iniciales, nombre, #número, teléfono, asesor,
 * chip de estado y etiquetas. El CLUSTER del contacto es clickeable — abre el
 * panel del cliente (task 6, "aparece al hacer clic", pedido explícito del
 * usuario). La tarjeta de la propiedad es un link aparte, directo a la ficha
 * (comportamiento que ya existía, se conserva).
 *
 * `actionsSlot` (ajuste de altura, 2026-08-01): el dueño se quejó de "un
 * espacio muerto" entre esta cabecera y la barra de Propiedad/Plantilla/
 * Etiquetas/Estado, que antes era su propia fila con su propio borde+padding
 * (`ThreadActionsBar`). Se eligió la opción (a) del brief — fusionar esa barra
 * DENTRO de esta misma fila — en vez de la (b) (fila propia pero pegada)
 * porque ahorra una fila completa (borde + padding) en vez de solo el
 * espaciado entre filas, y el ancho de la columna del hilo (`md:grid-cols-
 * [340px_1fr]` dentro de un `max-w-7xl`) alcanza de sobra en escritorio; en
 * pantallas angostas `flex-wrap` la baja a una segunda línea, ni mejor ni peor
 * que antes. Opcional para que `scripts/whatsapp-chat.probe.tsx` pueda seguir
 * renderizando la cabecera sola.
 */
export function ThreadHeader({
  onBack,
  contactName,
  phone,
  leadNumber,
  advisorName,
  pipelineState,
  tags,
  property,
  onOpenContact,
  actionsSlot,
}: {
  onBack?: () => void
  contactName: string | null
  phone: string
  leadNumber: number | null
  advisorName: string | null
  pipelineState: string | null | undefined
  tags: LeadTagRef[]
  property: { id: string; address: string; title: string | null; cover_photo: string | null } | null
  onOpenContact: () => void
  actionsSlot?: React.ReactNode
}) {
  return (
    // En celular la cabecera es UNA sola fila que no envuelve (`flex-nowrap`):
    // volver · contacto · menú. Con `flex-wrap` y los 5 botones de acciones
    // adentro, la cabecera se comía dos y tres renglones del alto que le hace
    // falta al hilo. De `md:` para arriba queda exactamente como estaba.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2 max-md:flex-nowrap max-md:gap-x-1 max-md:px-2">
      {onBack && (
        // `size="icon"` (44px en celular por el piso táctil de `button.tsx`) y NO
        // `icon-sm` (40px): es el control que más se toca de toda la pantalla y
        // el único camino de vuelta a la lista. El `aria-label` es obligatorio —
        // el botón es solo una flecha, sin texto que leer.
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Volver a la lista de chats"
          className="md:hidden -ml-1 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}

      <button
        type="button"
        onClick={onOpenContact}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-muted/60"
        title="Ver los datos del contacto"
      >
        <Avatar name={contactName ?? phone} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-medium text-sm">
            <span className="truncate">{contactName ?? displayPhone(phone)}</span>
            {leadNumber != null && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                #{leadNumber}
              </span>
            )}
            <PipelineStateChip state={pipelineState} />
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {displayPhone(phone)}
            {advisorName && <span> · {advisorName}</span>}
          </p>
          {tags.length > 0 && <TagChipList tags={tags} max={4} className="mt-1" />}
        </div>
      </button>

      {property && (
        <Link
          href={`/properties/${property.id}`}
          className="hidden sm:flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 hover:bg-muted/60 transition"
        >
          {property.cover_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={property.cover_photo} alt="" className="h-9 w-9 rounded object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded bg-muted">
              <Home className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <span className="max-w-[140px] truncate text-xs font-medium">{property.address}</span>
        </Link>
      )}

      {/* `min-w-0` además de `shrink-0`: lo de adentro (`ThreadActionsBar`) ya
          decide por sí solo qué mostrar en cada ancho —la fila completa en
          escritorio, un único botón de tres puntos en celular—, así que este
          contenedor no tiene que imponerle un ancho mínimo. Sin el `min-w-0`, un
          hijo que no encoge dentro de una Card con `overflow-hidden` termina
          RECORTADO y sin forma de alcanzarlo: así era imposible cambiar el
          estado del embudo desde el teléfono. */}
      {actionsSlot && <div className="flex min-w-0 shrink-0 flex-col items-end gap-1">{actionsSlot}</div>}
    </div>
  )
}

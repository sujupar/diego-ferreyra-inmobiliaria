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
}) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-3">
      {onBack && (
        <Button variant="ghost" size="icon-sm" onClick={onBack} className="md:hidden -ml-1">
          <ArrowLeft className="h-4 w-4" />
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
    </div>
  )
}

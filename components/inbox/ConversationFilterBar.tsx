'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

export interface FilterOption {
  value: string
  label: string
}

/**
 * Barra de filtros de la pantalla de WhatsApp (Ajuste 2, 2026-08-01). Antes
 * vivía APILADA arriba de la lista, dentro de `ConversationList` — pedido
 * explícito del dueño: "los filtros... deberían estar arriba de todo... de
 * lado a lado, para que no ocupen espacio [de los chats]". Se subió a una
 * franja horizontal de ancho completo, debajo del encabezado de la página y
 * ANTES de las dos columnas (lista + hilo).
 *
 * 100% presentacional — el estado de los filtros y el filtrado en sí viven en
 * `WhatsappClient.tsx` (único padre común de esta barra y de
 * `ConversationList`, que ahora solo recibe la lista ya filtrada).
 */
export function ConversationFilterBar({
  search,
  onSearchChange,
  onlyUnanswered,
  onToggleUnanswered,
  onlyUnread,
  onToggleUnread,
  propertyOptions,
  filterPropertyId,
  onPropertyChange,
  showAdvisorFilter,
  advisorOptions,
  filterAdvisorId,
  onAdvisorChange,
  showTagFilter,
  tagOptions,
  filterTagSlug,
  onTagChange,
  stateOptions,
  filterPipelineState,
  onPipelineStateChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  onlyUnanswered: boolean
  onToggleUnanswered: () => void
  onlyUnread: boolean
  onToggleUnread: () => void
  propertyOptions: FilterOption[]
  filterPropertyId: string
  onPropertyChange: (value: string) => void
  showAdvisorFilter: boolean
  advisorOptions: FilterOption[]
  filterAdvisorId: string
  onAdvisorChange: (value: string) => void
  showTagFilter: boolean
  tagOptions: FilterOption[]
  filterTagSlug: string
  onTagChange: (value: string) => void
  stateOptions: FilterOption[]
  filterPipelineState: string
  onPipelineStateChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre, teléfono, mensaje o etiqueta…"
          className="h-8 pl-7 text-xs"
        />
      </div>
      <Button
        type="button"
        variant={onlyUnanswered ? 'default' : 'outline'}
        size="sm"
        className={`h-8 shrink-0 text-xs ${onlyUnanswered ? 'bg-amber-600 hover:bg-amber-600/90' : ''}`}
        onClick={onToggleUnanswered}
        title="Conversaciones donde el cliente escribió y todavía nadie le contestó"
      >
        Sin responder
      </Button>
      <Button
        type="button"
        variant={onlyUnread ? 'default' : 'outline'}
        size="sm"
        className="h-8 shrink-0 text-xs"
        onClick={onToggleUnread}
      >
        No leídas
      </Button>
      <Select
        options={propertyOptions}
        value={filterPropertyId}
        onChange={e => onPropertyChange(e.target.value)}
        className="h-8 min-w-[140px] text-xs"
      />
      {showAdvisorFilter && (
        <Select
          options={advisorOptions}
          value={filterAdvisorId}
          onChange={e => onAdvisorChange(e.target.value)}
          className="h-8 min-w-[130px] text-xs"
        />
      )}
      {showTagFilter && (
        <Select
          options={tagOptions}
          value={filterTagSlug}
          onChange={e => onTagChange(e.target.value)}
          className="h-8 min-w-[130px] text-xs"
        />
      )}
      <Select
        options={stateOptions}
        value={filterPipelineState}
        onChange={e => onPipelineStateChange(e.target.value)}
        className="h-8 min-w-[130px] text-xs"
      />
    </div>
  )
}

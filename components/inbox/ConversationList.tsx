'use client'

import { useMemo, useState } from 'react'
import { Loader2, MessageCircle, Search, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { PIPELINE_STATES, PIPELINE_STATE_LABELS } from '@/lib/leads/tags'
import { ConversationRow } from './ConversationRow'
import { filterConversations, DEFAULT_CONVERSATION_FILTERS } from './filters'
import type { ConversationListItem, LeadTagRef } from './types'

/**
 * Columna izquierda completa (task 4): barra de filtros + lista. Dueña de su
 * propio estado de filtros — `WhatsappClient` solo le pasa los datos crudos
 * (ya enriquecidos por `GET /api/whatsapp/conversations`, o no si ese
 * endpoint todavía no manda los campos nuevos: acá todo tolera esa ausencia).
 *
 * El filtro "Sin responder" va primero y destacado a propósito — es "la
 * plata que se está enfriando" (brief), el que el equipo va a usar más.
 */
export function ConversationList({
  conversations,
  loading,
  error,
  selectedPhone,
  onSelectPhone,
  tagCatalog,
  userRole,
}: {
  conversations: ConversationListItem[] | null
  loading: boolean
  error: string | null
  selectedPhone: string | null
  onSelectPhone: (phone: string) => void
  tagCatalog: LeadTagRef[]
  userRole: string
}) {
  const [search, setSearch] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [onlyUnanswered, setOnlyUnanswered] = useState(false)
  const [filterPropertyId, setFilterPropertyId] = useState('all')
  const [filterAdvisorId, setFilterAdvisorId] = useState('all')
  const [filterTagSlug, setFilterTagSlug] = useState('all')
  const [filterPipelineState, setFilterPipelineState] = useState('all')

  const propertyOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of conversations ?? []) {
      if (c.property) map.set(c.property.id, c.property.address)
    }
    return [{ value: 'all', label: 'Todas las propiedades' }, ...Array.from(map, ([value, label]) => ({ value, label }))]
  }, [conversations])

  const advisorOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of conversations ?? []) {
      const name = c.assigned_to_name ?? c.advisor_name
      if (c.advisor_id && name) map.set(c.advisor_id, name)
    }
    return [{ value: 'all', label: 'Todos los asesores' }, ...Array.from(map, ([value, label]) => ({ value, label }))]
  }, [conversations])

  const tagOptions = useMemo(
    () => [{ value: 'all', label: 'Todas las etiquetas' }, ...tagCatalog.map(t => ({ value: t.slug, label: t.label }))],
    [tagCatalog],
  )

  const stateOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos los estados' },
      ...PIPELINE_STATES.map(s => ({ value: s, label: PIPELINE_STATE_LABELS[s] })),
    ],
    [],
  )

  const visible = useMemo(
    () =>
      filterConversations(conversations ?? [], {
        ...DEFAULT_CONVERSATION_FILTERS,
        search,
        onlyUnread,
        onlyUnanswered,
        propertyId: filterPropertyId,
        advisorId: filterAdvisorId,
        tagSlug: filterTagSlug,
        pipelineState: filterPipelineState,
      }),
    [conversations, search, onlyUnread, onlyUnanswered, filterPropertyId, filterAdvisorId, filterTagSlug, filterPipelineState],
  )

  const filtersActive =
    onlyUnread || onlyUnanswered || filterPropertyId !== 'all' || filterAdvisorId !== 'all' || filterTagSlug !== 'all' || filterPipelineState !== 'all' || search.trim() !== ''

  return (
    <>
      <div className="space-y-2 border-b p-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono, mensaje o etiqueta…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant={onlyUnanswered ? 'default' : 'outline'}
            size="sm"
            className={`h-8 shrink-0 text-xs ${onlyUnanswered ? 'bg-amber-600 hover:bg-amber-600/90' : ''}`}
            onClick={() => setOnlyUnanswered(v => !v)}
            title="Conversaciones donde el cliente escribió y todavía nadie le contestó"
          >
            Sin responder
          </Button>
          <Button
            type="button"
            variant={onlyUnread ? 'default' : 'outline'}
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={() => setOnlyUnread(v => !v)}
          >
            No leídas
          </Button>
          <Select
            options={propertyOptions}
            value={filterPropertyId}
            onChange={e => setFilterPropertyId(e.target.value)}
            className="h-8 min-w-[120px] flex-1 text-xs"
          />
          {userRole !== 'asesor' && (
            <Select
              options={advisorOptions}
              value={filterAdvisorId}
              onChange={e => setFilterAdvisorId(e.target.value)}
              className="h-8 min-w-[110px] flex-1 text-xs"
            />
          )}
          {tagCatalog.length > 0 && (
            <Select
              options={tagOptions}
              value={filterTagSlug}
              onChange={e => setFilterTagSlug(e.target.value)}
              className="h-8 min-w-[110px] flex-1 text-xs"
            />
          )}
          <Select
            options={stateOptions}
            value={filterPipelineState}
            onChange={e => setFilterPipelineState(e.target.value)}
            className="h-8 min-w-[110px] flex-1 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && !conversations ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 p-4 text-sm text-[color:var(--destructive)]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        ) : !conversations || conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-2 px-4 py-14">
            <MessageCircle className="h-9 w-9 text-muted-foreground" />
            <p className="text-sm font-medium">Todavía no hay conversaciones de WhatsApp</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Acá van a aparecer los WhatsApp que manda el sistema (recordatorios, confirmaciones) y las respuestas de
              los clientes apenas entren.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-2 px-4 py-14">
            <p className="text-sm text-muted-foreground">
              {filtersActive ? 'Ningún resultado con estos filtros.' : 'Ningún resultado.'}
            </p>
          </div>
        ) : (
          visible.map(c => (
            <ConversationRow key={c.phone_e164} item={c} active={selectedPhone === c.phone_e164} onSelect={() => onSelectPhone(c.phone_e164)} />
          ))
        )}
      </div>
    </>
  )
}

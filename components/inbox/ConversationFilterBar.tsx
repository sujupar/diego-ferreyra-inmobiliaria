'use client'

import { Search, ChevronDown, Check, Timer, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface FilterOption {
  value: string
  label: string
}

/**
 * Un filtro "liviano": texto + chevron, sin caja gruesa alrededor — el look
 * pedido explícitamente por el dueño (Ajuste 1, 2026-08-01) en vez del
 * `<select>` nativo de ancho completo (`w-full` de `components/ui/select.tsx`)
 * que forzaba cada filtro a ocupar una línea entera por sí solo.
 */
function FilterDropdown({
  options,
  value,
  onChange,
  className = '',
}: {
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const selectedLabel = options.find(o => o.value === value)?.label ?? options[0]?.label ?? ''
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-8 shrink-0 gap-1 rounded-full px-2.5 text-xs font-normal text-foreground hover:bg-muted ${className}`}
        >
          <span className="max-w-[120px] truncate">{selectedLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {options.map(option => (
          <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)}>
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {option.value === value && <Check className="h-3.5 w-3.5" />}
            </span>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Barra de filtros de la pantalla de WhatsApp (Ajuste 1, 2026-08-01 — rehecha
 * en `fix/chat-filtros-compactos`). Pedido textual del dueño tras probar la
 * franja de ancho completo: ocupaba 5 líneas ("un espacio gigante" que le
 * quitaba lugar a la lista de chats) porque cada filtro era un `<select>`
 * nativo con `w-full`. Ahora es UNA línea horizontal: buscador angosto +
 * filtros como controles livianos (texto + chevron, `FilterDropdown` arriba)
 * con aire entre ellos. En pantallas angostas, `flex-wrap` deja que colapse
 * con elegancia a 2 líneas en vez de reventar en 5+ — ya no hay ningún control
 * que fuerce su propia línea completa.
 *
 * 100% presentacional — el estado de los filtros y el filtrado en sí viven en
 * `WhatsappClient.tsx` (único padre común de esta barra y de
 * `ConversationList`, que solo recibe la lista ya filtrada).
 *
 * `onlyWindowClosing`/`onlyAiOrder` (Task 4, 2026-08-03): dos botones MÁS,
 * no uno — "Ventana por cerrar" es puramente calculado (anda con la IA
 * apagada o caída) y "Orden IA" combina ese cálculo con la lectura de la IA.
 * Opcionales con default `false`/no-op para no romper callers viejos (ej. el
 * probe `scripts/whatsapp-chat.probe.tsx`, que arma `filterBarBaseProps` sin
 * estas dos props).
 */
export function ConversationFilterBar({
  search,
  onSearchChange,
  onlyUnanswered,
  onToggleUnanswered,
  onlyUnread,
  onToggleUnread,
  onlyWindowClosing = false,
  onToggleWindowClosing = () => {},
  onlyAiOrder = false,
  onToggleAiOrder = () => {},
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
  onlyWindowClosing?: boolean
  onToggleWindowClosing?: () => void
  onlyAiOrder?: boolean
  onToggleAiOrder?: () => void
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
      <div className="relative w-40 shrink-0 grow sm:w-52 sm:grow-0">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre, teléfono, mensaje o etiqueta…"
          className="h-8 pl-7 text-xs"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        <FilterDropdown options={propertyOptions} value={filterPropertyId} onChange={onPropertyChange} />
        {showAdvisorFilter && (
          <FilterDropdown options={advisorOptions} value={filterAdvisorId} onChange={onAdvisorChange} />
        )}
        {showTagFilter && <FilterDropdown options={tagOptions} value={filterTagSlug} onChange={onTagChange} />}
        <FilterDropdown options={stateOptions} value={filterPipelineState} onChange={onPipelineStateChange} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
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
        <Button
          type="button"
          variant={onlyWindowClosing ? 'default' : 'outline'}
          size="sm"
          className={`h-8 shrink-0 gap-1 text-xs ${onlyWindowClosing ? 'bg-amber-600 hover:bg-amber-600/90' : ''}`}
          onClick={onToggleWindowClosing}
          title="Ordena las que tienen ventana de 24hs abierta por cuánto les queda — cálculo puro, funciona con la IA apagada"
        >
          <Timer className="h-3.5 w-3.5" />
          Ventana por cerrar
        </Button>
        <Button
          type="button"
          variant={onlyAiOrder ? 'default' : 'outline'}
          size="sm"
          className={`h-8 shrink-0 gap-1 text-xs ${onlyAiOrder ? 'bg-violet-600 hover:bg-violet-600/90' : ''}`}
          onClick={onToggleAiOrder}
          title="Ordena por prioridad combinando la ventana de 24hs con la lectura de la IA"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Orden IA
        </Button>
      </div>
    </div>
  )
}

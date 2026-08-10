'use client'

import { useState } from 'react'
import { Search, ChevronDown, Check, Timer, Sparkles, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export interface FilterOption {
  value: string
  label: string
}

/**
 * Un filtro "liviano": texto + chevron, sin caja gruesa alrededor — el look
 * pedido explícitamente por el dueño (Ajuste 1, 2026-08-01) en vez del
 * `<select>` nativo de ancho completo (`w-full` de `components/ui/select.tsx`)
 * que forzaba cada filtro a ocupar una línea entera por sí solo.
 *
 * Solo se usa en la barra de ESCRITORIO. En la hoja de celular los mismos
 * filtros van como `<select>` nativos a ancho completo, que es lo correcto ahí:
 * la rueda de iOS y el selector de Android son mejores que cualquier popover
 * propio con el pulgar, y el `<select>` ya está cubierto por la regla de los
 * 16px de `globals.css` (si no, iOS hace zoom al abrirlo).
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
 * con aire entre ellos.
 *
 * FASE 1 DEL SISTEMA MÓVIL — la misma barra, dos formas:
 *
 *  · `md:` para arriba: exactamente lo de siempre, ni una clase cambiada.
 *  · Abajo de 768px: UNA sola fila — buscador + un botón "Filtros" que abre una
 *    hoja inferior con los 4 desplegables y los 4 interruptores. En 390px, la
 *    barra de escritorio se apilaba en TRES filas (buscador / 4 desplegables
 *    envueltos / 4 botones) y se llevaba ~164px permanentes de una pantalla
 *    donde al hilo le quedaban 50. El botón muestra cuántos filtros hay puestos,
 *    así que esconderlos no esconde que están activos.
 *
 * Los controles NO están duplicados: `desplegables` e `interruptores` se arman
 * una vez a partir de las props y las dos vistas recorren la misma lista. Si
 * mañana entra un filtro nuevo, entra en los dos lados o en ninguno.
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
  const [hojaAbierta, setHojaAbierta] = useState(false)

  /** Los cuatro desplegables, en el orden en que se ven. */
  const desplegables: {
    key: string
    etiqueta: string
    options: FilterOption[]
    value: string
    onChange: (value: string) => void
  }[] = [
    { key: 'propiedad', etiqueta: 'Propiedad', options: propertyOptions, value: filterPropertyId, onChange: onPropertyChange },
    ...(showAdvisorFilter
      ? [{ key: 'asesor', etiqueta: 'Asesor', options: advisorOptions, value: filterAdvisorId, onChange: onAdvisorChange }]
      : []),
    ...(showTagFilter
      ? [{ key: 'etiqueta', etiqueta: 'Etiqueta', options: tagOptions, value: filterTagSlug, onChange: onTagChange }]
      : []),
    { key: 'estado', etiqueta: 'Estado', options: stateOptions, value: filterPipelineState, onChange: onPipelineStateChange },
  ]

  /** Los cuatro botones de encendido/apagado, con su color de "prendido". */
  const interruptores: {
    key: string
    etiqueta: string
    icono?: LucideIcon
    activo: boolean
    onToggle: () => void
    ayuda?: string
    claseActiva?: string
  }[] = [
    {
      key: 'sin-responder',
      etiqueta: 'Sin responder',
      activo: onlyUnanswered,
      onToggle: onToggleUnanswered,
      ayuda: 'Conversaciones donde el cliente escribió y todavía nadie le contestó',
      claseActiva: 'bg-amber-600 hover:bg-amber-600/90',
    },
    { key: 'no-leidas', etiqueta: 'No leídas', activo: onlyUnread, onToggle: onToggleUnread },
    {
      key: 'ventana',
      etiqueta: 'Ventana por cerrar',
      icono: Timer,
      activo: onlyWindowClosing,
      onToggle: onToggleWindowClosing,
      ayuda: 'Ordena las que tienen ventana de 24hs abierta por cuánto les queda — cálculo puro, funciona con la IA apagada',
      claseActiva: 'bg-amber-600 hover:bg-amber-600/90',
    },
    {
      key: 'orden-ia',
      etiqueta: 'Orden IA',
      icono: Sparkles,
      activo: onlyAiOrder,
      onToggle: onToggleAiOrder,
      ayuda: 'Ordena por prioridad combinando la ventana de 24hs con la lectura de la IA',
      claseActiva: 'bg-violet-600 hover:bg-violet-600/90',
    },
  ]

  /**
   * Cuántos filtros hay puestos, para que el botón "Filtros" del celular no
   * esconda que la lista está recortada. El buscador NO cuenta: se ve solo, al
   * lado del botón.
   */
  const filtrosPuestos =
    desplegables.filter(d => d.value !== 'all').length + interruptores.filter(i => i.activo).length

  return (
    <div className="border-b pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative w-40 shrink-0 grow sm:w-52 sm:grow-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar por nombre, teléfono, mensaje o etiqueta…"
            aria-label="Buscar conversaciones"
            className="h-8 pl-7 text-xs"
          />
        </div>

        {/* CELULAR: un solo botón, que además dice cuántos filtros hay puestos. */}
        <Button
          type="button"
          variant={filtrosPuestos > 0 ? 'default' : 'outline'}
          size="sm"
          className="shrink-0 gap-1.5 md:hidden"
          onClick={() => setHojaAbierta(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros{filtrosPuestos > 0 ? ` (${filtrosPuestos})` : ''}
        </Button>

        {/* ESCRITORIO: los mismos controles, tal cual estaban. */}
        <div className="hidden flex-wrap items-center gap-x-1 gap-y-2 md:flex">
          {desplegables.map(d => (
            <FilterDropdown key={d.key} options={d.options} value={d.value} onChange={d.onChange} />
          ))}
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
          {interruptores.map(i => (
            <Button
              key={i.key}
              type="button"
              variant={i.activo ? 'default' : 'outline'}
              size="sm"
              className={`h-8 shrink-0 gap-1 text-xs ${i.activo ? (i.claseActiva ?? '') : ''}`}
              onClick={i.onToggle}
              title={i.ayuda}
              aria-pressed={i.activo}
            >
              {i.icono && <i.icono className="h-3.5 w-3.5" />}
              {i.etiqueta}
            </Button>
          ))}
        </div>
      </div>

      {/* La hoja inferior existe solo para el celular (su disparador es
          `md:hidden`), pero NO se le pone `md:hidden` al contenido: si alguien
          gira el teléfono con la hoja abierta, es mejor que siga siendo una hoja
          usable con su botón de cerrar que un modal invisible que igual atrapa el
          foco. `side="bottom"` ya trae de la Fase 0 el techo por `--app-vh`, el
          scroll propio y el respeto por la barra de gestos. */}
      <Sheet open={hojaAbierta} onOpenChange={setHojaAbierta}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Se aplican a la lista de conversaciones.</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-4">
            {desplegables.map(d => (
              <label key={d.key} className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">{d.etiqueta}</span>
                {/* `<select>` nativo a propósito: con el pulgar, la rueda del
                    sistema le gana a cualquier popover. */}
                <select
                  value={d.value}
                  onChange={e => d.onChange(e.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3"
                >
                  {d.options.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            <div className="grid grid-cols-2 gap-2">
              {interruptores.map(i => (
                <Button
                  key={i.key}
                  type="button"
                  variant={i.activo ? 'default' : 'outline'}
                  className={`justify-start gap-1.5 text-xs ${i.activo ? (i.claseActiva ?? '') : ''}`}
                  onClick={i.onToggle}
                  aria-pressed={i.activo}
                >
                  {i.icono && <i.icono className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{i.etiqueta}</span>
                </Button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

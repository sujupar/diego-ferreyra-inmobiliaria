'use client'

import Link from 'next/link'
import { ChevronRight, MapPin, Calendar, User } from 'lucide-react'
import { getCRMStageInfo } from './crm-stages'
import { ORIGIN_LABELS } from './constants'
import { formatDate, timeAgo } from './format'
import type { Deal } from './types'
import { EnlaceContacto } from '@/components/crm/EnlaceContacto'

interface Props {
  deals: (Deal & { crmStage: string })[]
  selectMode: boolean
  selectedIds: Set<string>
  onToggleSelection: (id: string) => void
  isGlobal: boolean
  /** Rol de quien mira: el nombre enlaza a la ficha salvo para el abogado (y sin contacto). */
  rol?: string | null
}

/**
 * Vista "cards" del listado de procesos — presentación pura, extraída de
 * `crm/page.tsx` (task-11-brief.md, Step 7) para bajar el archivo de las
 * ~700 líneas. La lógica de datos (fetch, filtros, selección) se queda en la
 * página; acá solo se recibe lo ya calculado.
 */
export function DealsList({ deals, selectMode, selectedIds, onToggleSelection, isGlobal, rol = null }: Props) {
  return (
    <div className="space-y-2">
      {deals.map((deal, idx) => {
        const stageInfo = getCRMStageInfo(deal.crmStage)
        const Icon = stageInfo.icon
        const isSelected = selectedIds.has(deal.id)
        // crm-ficha-y-llamadas 11.1: el nombre abre la ficha y el resto de la tarjeta sigue
        // abriendo el proceso. Un enlace adentro de otro no es HTML válido, así que la
        // tarjeta usa un enlace "estirado" (capa encima de todo) y el nombre queda arriba de él.
        const rowInner = (
          <div className={`flex items-center gap-4 p-4 rounded-xl border bg-card transition-all duration-200 cursor-pointer group-hover:shadow-sm ${isSelected ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20' : 'group-hover:bg-muted/30'}`}>
              {selectMode && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelection(deal.id)}
                  onClick={e => e.stopPropagation()}
                  className="h-4 w-4 rounded border-input cursor-pointer shrink-0"
                  aria-label="Seleccionar proceso"
                />
              )}
              {/* Number prefix */}
              <span className="number-prefix text-lg leading-none w-7 text-right shrink-0 tabular-nums">
                {String(idx + 1).padStart(2, '0')}
              </span>

              {/* Avatar */}
              <div className="h-11 w-11 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {deal.contact_name.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <EnlaceContacto
                    contactoId={selectMode ? null : deal.contacts?.id}
                    rol={rol}
                    className="relative z-[2] font-semibold text-sm"
                  >
                    {deal.contact_name}
                  </EnlaceContacto>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${stageInfo.badgeBg} ${stageInfo.badgeText}`}>
                    <Icon className="h-3 w-3" />
                    {stageInfo.label}
                  </span>
                  {deal.origin && (
                    <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{ORIGIN_LABELS[deal.origin] || deal.origin}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1 truncate max-w-[250px]">
                    <MapPin className="h-3 w-3 shrink-0" />{deal.property_address}
                  </span>
                  {deal.scheduled_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /><span className="tabular-n">{formatDate(deal.scheduled_date)}</span>
                    </span>
                  )}
                  {isGlobal && deal.assigned_to_name && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />{deal.assigned_to_name}
                    </span>
                  )}
                </div>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="tabular-n text-[11px] text-muted-foreground hidden sm:block">{timeAgo(deal.stage_changed_at)}</span>
                {!selectMode && <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />}
              </div>
            </div>
        )
        if (selectMode) {
          return (
            <div key={deal.id} className="group" onClick={() => onToggleSelection(deal.id)} role="button" tabIndex={0}>
              {rowInner}
            </div>
          )
        }
        return (
          <div key={deal.id} className="group relative">
            {rowInner}
            <Link
              href={`/pipeline/${deal.id}`}
              aria-label={`Abrir el proceso de ${deal.contact_name || 'este contacto'}`}
              className="absolute inset-0 z-[1] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )
      })}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Building2, Tag as TagIcon, Loader2, ChevronDown, Check, MessageSquareText, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PipelineStateChip } from './PipelineStateChip'
import { PIPELINE_STATES, PIPELINE_STATE_LABELS, type PipelineState } from '@/lib/leads/tags'
import type { LeadTagRef } from './types'

/** Mismo patrón tolerante que `WhatsappClient.tsx` / `ContactPanel.tsx`: nunca mostrar "Unexpected token '<'". */
async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      return { error: 'El servidor tardó demasiado y cortó la operación. Volvé a intentar.' } as never
    }
    return { error: `El servidor respondió algo inesperado (${res.status}). Volvé a intentar.` } as never
  }
}

/**
 * Barra de acciones del hilo (Ajuste 1, 2026-08-01): "Enviar información de la
 * propiedad" + "Plantilla" (ya existían) + "Etiquetas" y "Estado" (NUEVO).
 *
 * Pedido textual del dueño: poner una etiqueta "casi hay que abrir el
 * contacto" — con esto se puede etiquetar y cambiar el estado del embudo SIN
 * abrir `ContactPanel`. El panel del cliente SIGUE existiendo igual (no es un
 * reemplazo, es un atajo) y comparte la MISMA fuente de verdad: ambos llaman
 * a `onTagsChanged`/`onStateChanged` (que en `WhatsappClient` actualizan
 * `conversations`), así que un cambio hecho acá se refleja también si el
 * panel está abierto, y viceversa — sin dos copias de estado que puedan
 * desincronizarse.
 *
 * Etiquetas: multi-selección, un clic agrega/quita (`POST`/`DELETE
 * /api/leads/[id]/tags`), optimista con reversión ante error.
 *
 * Estado: cambiarlo pide SIEMPRE un motivo (`PATCH /api/leads/[id]/state`
 * exige `reason` no vacío) — se pide con un diálogo, nunca se manda un motivo
 * inventado.
 *
 * Si la conversación no está vinculada a un lead ("no resuelta"), ambos
 * controles quedan deshabilitados con una explicación visible debajo (no
 * ocultos) — decisión ya tomada en el brief.
 *
 * Densidad (Ajuste 2, `fix/chat-filtros-compactos`, 2026-08-01): el dueño
 * pidió que esta barra ocupe "una sola línea que respire" — botones más
 * chicos (h-7) e íconos delante de cada acción (antes solo "Enviar
 * información de la propiedad" y "Etiquetas" tenían ícono). El botón de
 * propiedad muestra el texto corto "Propiedad" pero conserva el título
 * completo "Enviar información de la propiedad" como `title=` (tooltip +
 * accesible para lectores de pantalla) — no se perdió texto, solo se movió
 * de visible a tooltip para no ser el elemento más ancho de la fila.
 *
 * `bare` (ajuste de altura, 2026-08-01): cuando es `true`, esta barra deja de
 * dibujar su propio borde+padding (`border-b px-3 py-1.5`) porque
 * `ThreadHeader` la incrusta en su MISMA fila vía `actionsSlot` (opción (a)
 * del brief, ver comentario en `ThreadHeader.tsx`) — dos filas con dos bordes
 * y dos paddings eran justamente el "espacio muerto" que se quejó el dueño.
 * Default `false` para no tocar el comportamiento (ni el HTML que verifica)
 * de `scripts/whatsapp-chat.probe.tsx`, que sigue renderizando esta barra
 * SOLA con las props por defecto.
 *
 * `showStateChip` (mismo ajuste): oculta el chip de estado al final de la
 * barra cuando ya se muestra al lado del nombre en `ThreadHeader` — evitar
 * mostrarlo dos veces en la misma fila fusionada. Default `true` (comportamiento
 * de siempre, lo que el probe verifica).
 */
export interface ThreadActionsBarProps {
  property: { id: string; address: string; title: string | null; cover_photo: string | null } | null
  onOpenPropertyInfo: () => void
  onOpenTemplatePicker: () => void
  lead: { id: string; name: string; lead_number: number | null } | null
  tags: LeadTagRef[]
  tagCatalog: LeadTagRef[]
  pipelineState: string | null | undefined
  onTagsChanged: (leadId: string, tags: LeadTagRef[]) => void
  onStateChanged: (leadId: string, state: PipelineState) => void
  bare?: boolean
  showStateChip?: boolean
}

const NO_LEAD_EXPLANATION =
  'Esta conversación todavía no está vinculada a un lead — no se puede etiquetar ni cambiar el estado desde acá.'

export function ThreadActionsBar({
  property,
  onOpenPropertyInfo,
  onOpenTemplatePicker,
  lead,
  tags,
  tagCatalog,
  pipelineState,
  onTagsChanged,
  onStateChanged,
  bare = false,
  showStateChip = true,
}: ThreadActionsBarProps) {
  const [tagBusySlug, setTagBusySlug] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string | null>(null)

  const [pendingState, setPendingState] = useState<PipelineState | null>(null)
  const [reason, setReason] = useState('')
  const [stateSubmitting, setStateSubmitting] = useState(false)
  const [stateError, setStateError] = useState<string | null>(null)

  const resolved = Boolean(lead)

  async function toggleTag(tag: LeadTagRef) {
    if (!lead || tagBusySlug) return
    setTagBusySlug(tag.slug)
    setTagError(null)
    const previous = tags
    const has = tags.some(t => t.slug === tag.slug)
    const optimistic = has ? tags.filter(t => t.slug !== tag.slug) : [...tags, tag]
    onTagsChanged(lead.id, optimistic)
    try {
      const res = await fetch(`/api/leads/${lead.id}/tags`, {
        method: has ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tagSlug: tag.slug }),
      })
      const body = await readJson<{ data?: { tags?: LeadTagRef[] } }>(res)
      if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar la etiqueta.')
      onTagsChanged(lead.id, body.data?.tags ?? optimistic)
    } catch (err) {
      onTagsChanged(lead.id, previous)
      setTagError(err instanceof Error ? err.message : 'No se pudo actualizar la etiqueta. Probá de nuevo.')
    } finally {
      setTagBusySlug(null)
    }
  }

  function requestStateChange(state: PipelineState) {
    if (!lead || state === pipelineState) return
    setPendingState(state)
    setReason('')
    setStateError(null)
  }

  function closeStateDialog() {
    if (stateSubmitting) return
    setPendingState(null)
    setReason('')
    setStateError(null)
  }

  async function confirmStateChange() {
    if (!lead || !pendingState) return
    if (!reason.trim()) {
      setStateError('Contá brevemente el motivo del cambio — es obligatorio.')
      return
    }
    setStateSubmitting(true)
    setStateError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/state`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: pendingState, reason: reason.trim() }),
      })
      const body = await readJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(body.error ?? 'No se pudo cambiar el estado.')
      onStateChanged(lead.id, pendingState)
      setPendingState(null)
      setReason('')
    } catch (err) {
      setStateError(err instanceof Error ? err.message : 'No se pudo cambiar el estado. Probá de nuevo.')
    } finally {
      setStateSubmitting(false)
    }
  }

  return (
    <div className={bare ? '' : 'border-b px-3 py-1.5'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={!property}
          onClick={onOpenPropertyInfo}
          title={!property ? 'Esta conversación no tiene una propiedad asociada' : 'Enviar información de la propiedad'}
          aria-label="Enviar información de la propiedad"
        >
          <Building2 className="h-3.5 w-3.5" /> Propiedad
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onOpenTemplatePicker}
        >
          <MessageSquareText className="h-3.5 w-3.5" /> Plantilla
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={!resolved}
              title={!resolved ? NO_LEAD_EXPLANATION : undefined}
              data-testid="thread-actions-tags-button"
            >
              <TagIcon className="h-3.5 w-3.5" />
              Etiquetas{tags.length > 0 ? ` (${tags.length})` : ''}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            {tagCatalog.length === 0 ? (
              <DropdownMenuLabel className="font-normal text-muted-foreground">Todavía no hay etiquetas cargadas.</DropdownMenuLabel>
            ) : (
              tagCatalog.map(tag => {
                const active = tags.some(t => t.slug === tag.slug)
                return (
                  <DropdownMenuItem
                    key={tag.slug}
                    disabled={Boolean(tagBusySlug)}
                    onSelect={e => {
                      e.preventDefault() // no cerrar el menú: se pueden tocar varias etiquetas seguidas
                      toggleTag(tag)
                    }}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                        active ? 'border-[color:var(--brand)] bg-[color:var(--brand)]' : ''
                      }`}
                    >
                      {active && <Check className="h-3 w-3 text-white" />}
                    </span>
                    {tag.label}
                    {tagBusySlug === tag.slug && <Loader2 className="ml-auto h-3 w-3 animate-spin" />}
                  </DropdownMenuItem>
                )
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={!resolved}
              title={!resolved ? NO_LEAD_EXPLANATION : undefined}
              data-testid="thread-actions-state-button"
            >
              <Workflow className="h-3.5 w-3.5" />
              Estado
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PIPELINE_STATES.map(state => (
              <DropdownMenuItem key={state} onSelect={() => requestStateChange(state)}>
                {state === pipelineState && <Check className="h-3.5 w-3.5" />}
                {PIPELINE_STATE_LABELS[state]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {showStateChip && pipelineState && <PipelineStateChip state={pipelineState} />}
      </div>

      {tagError && <p className="mt-1.5 text-xs font-medium text-[color:var(--destructive)]">{tagError}</p>}
      {!resolved && <p className="mt-1.5 text-xs text-muted-foreground">{NO_LEAD_EXPLANATION}</p>}

      <Dialog open={pendingState != null} onOpenChange={open => !open && closeStateDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar estado a &quot;{pendingState ? PIPELINE_STATE_LABELS[pendingState] : ''}&quot;</DialogTitle>
            <DialogDescription>
              Contá brevemente por qué cambiás el estado a mano — queda registrado en el historial del lead.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej: el cliente confirmó por teléfono que ya no le interesa"
            rows={3}
            disabled={stateSubmitting}
          />
          {stateError && <p className="text-xs font-medium text-[color:var(--destructive)]">{stateError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={closeStateDialog} disabled={stateSubmitting}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={confirmStateChange} disabled={stateSubmitting}>
              {stateSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  X,
  Phone,
  Mail,
  Tag as TagIcon,
  Plus,
  Loader2,
  Building2,
  UserRound,
  ExternalLink,
  MessageCircle,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'
import { TagChip } from './TagChip'
import { PipelineStateChip } from './PipelineStateChip'
import { formatDuration, displayPhone } from './format'
import type { LeadTagRef, ThreadMessage } from './types'
import { computeThreadMetrics } from './thread-metrics'

/**
 * Panel del cliente (task 6) — se abre al hacer clic en la cabecera del hilo
 * (`ThreadHeader`), NUNCA fijo: pedido explícito del usuario. En pantalla
 * chica es una hoja que sube desde abajo; en desktop, una columna que entra
 * desde la derecha por encima del contenido (no ocupa espacio permanente).
 *
 * Datos: lo que ya tiene el padre (nombre, teléfono, propiedad, tags, estado)
 * se pasa por props — cero fetch para eso. Lo que falta (email, origen del
 * lead, precio de la propiedad) se busca acá mismo, solo cuando el panel se
 * abre, contra endpoints YA EXISTENTES (`GET /api/leads/[id]`,
 * `GET /api/properties/[id]`) que esta tarea no toca ni modifica.
 */

// Mismo patrón que `components/properties/LandingSection.tsx` /
// `components/inbox/PropertyInfoDialog.tsx`: tolerar respuestas no-JSON.
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

// Mismo mapeo que `app/(dashboard)/inbox/InboxClient.tsx` / `LeadDetailSheet.tsx`
// (duplicado a propósito — patrón ya establecido en este código: cada archivo
// tiene su propia copia chica en vez de un módulo compartido para un objeto
// literal de 5 líneas).
const SOURCE_LABELS: Record<string, string> = {
  landing: 'Landing',
  meta_form: 'Meta Ads',
  portal_mercadolibre: 'MercadoLibre',
  portal_argenprop: 'Argenprop',
  portal_zonaprop: 'ZonaProp',
}

function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'Sin origen registrado'
  return SOURCE_LABELS[source] ?? source
}

function operationLabel(op: string | null | undefined): string {
  const key = (op ?? 'venta').toString().toLowerCase().trim()
  if (key === 'alquiler') return 'En alquiler'
  if (key.includes('temporari') || key.includes('temporal')) return 'Alquiler temporario'
  return 'En venta'
}

function formatMoney(value: number, currency: string | null | undefined): string {
  const cur = currency || 'USD'
  const n = Math.round(value).toLocaleString('es-AR')
  return cur === 'ARS' ? `$${n}` : `${cur} ${n}`
}

interface LeadDetail {
  email: string | null
  source: string | null
}

interface PropertyDetail {
  asking_price: number | null
  currency: string | null
  operation_type: string | null
}

export interface ContactPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  phone: string
  contactName: string | null
  lead: { id: string; name: string; lead_number: number | null } | null
  property: { id: string; address: string; title: string | null; cover_photo: string | null } | null
  pipelineState: string | null | undefined
  tags: LeadTagRef[]
  tagCatalog: LeadTagRef[]
  advisorName: string | null
  messages: ThreadMessage[]
  /** Avisa al padre para que actualice la fila de la lista sin esperar al próximo poll. */
  onTagsChanged?: (leadId: string, tags: LeadTagRef[]) => void
}

export function ContactPanel({
  open,
  onOpenChange,
  phone,
  contactName,
  lead,
  property,
  pipelineState,
  tags,
  tagCatalog,
  advisorName,
  messages,
  onTagsChanged,
}: ContactPanelProps) {
  const [localTags, setLocalTags] = useState<LeadTagRef[]>(tags)
  const [tagBusySlug, setTagBusySlug] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string | null>(null)

  const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null)
  const [propertyDetail, setPropertyDetail] = useState<PropertyDetail | null>(null)

  // Al abrir (o cambiar de contacto), partir de las etiquetas que YA trae la
  // lista y pedir lo que falta. No resincroniza en cada poll del padre
  // mientras el panel está abierto — evita pisar una edición en curso.
  useEffect(() => {
    if (!open) return
    setLocalTags(tags)
    setTagError(null)
    setLeadDetail(null)
    setPropertyDetail(null)

    if (lead) {
      fetch(`/api/leads/${lead.id}`)
        .then(res => readJson<{ data?: { email: string | null; source: string | null } }>(res).then(body => ({ res, body })))
        .then(({ res, body }) => {
          if (!res.ok || !body.data) return
          setLeadDetail({ email: body.data.email ?? null, source: body.data.source ?? null })
        })
        .catch(() => {
          /* best-effort: sin email/origen, el resto del panel se muestra igual */
        })
    }

    if (property) {
      fetch(`/api/properties/${property.id}`)
        .then(res => readJson<{ data?: PropertyDetail }>(res).then(body => ({ res, body })))
        .then(({ res, body }) => {
          if (!res.ok || !body.data) return
          setPropertyDetail(body.data)
        })
        .catch(() => {
          /* best-effort: sin precio, el resto del panel se muestra igual */
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberado: solo re-corre al abrir/cambiar de contacto, no en cada cambio de `tags` del poll
  }, [open, phone, lead?.id, property?.id])

  // Cerrar con Escape — misma expectativa que cualquier overlay de la app.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const availableToAdd = tagCatalog.filter(t => !localTags.some(lt => lt.slug === t.slug))

  const addTag = useCallback(
    async (tag: LeadTagRef) => {
      if (!lead || tagBusySlug) return
      setTagBusySlug(tag.slug)
      setTagError(null)
      const previous = localTags
      const optimistic = [...localTags, tag]
      setLocalTags(optimistic)
      try {
        const res = await fetch(`/api/leads/${lead.id}/tags`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tagSlug: tag.slug }),
        })
        const body = await readJson<{ data?: { tags?: LeadTagRef[] } }>(res)
        if (!res.ok) throw new Error(body.error ?? 'No se pudo agregar la etiqueta.')
        const next = body.data?.tags ?? optimistic
        setLocalTags(next)
        onTagsChanged?.(lead.id, next)
      } catch (err) {
        setLocalTags(previous)
        setTagError(err instanceof Error ? err.message : 'No se pudo agregar la etiqueta. Probá de nuevo.')
      } finally {
        setTagBusySlug(null)
      }
    },
    [lead, localTags, tagBusySlug, onTagsChanged],
  )

  const removeTag = useCallback(
    async (tag: LeadTagRef) => {
      if (!lead || tagBusySlug) return
      setTagBusySlug(tag.slug)
      setTagError(null)
      const previous = localTags
      const optimistic = localTags.filter(t => t.slug !== tag.slug)
      setLocalTags(optimistic)
      try {
        const res = await fetch(`/api/leads/${lead.id}/tags`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tagSlug: tag.slug }),
        })
        const body = await readJson<{ data?: { tags?: LeadTagRef[] } }>(res)
        if (!res.ok) throw new Error(body.error ?? 'No se pudo quitar la etiqueta.')
        const next = body.data?.tags ?? optimistic
        setLocalTags(next)
        onTagsChanged?.(lead.id, next)
      } catch (err) {
        setLocalTags(previous)
        setTagError(err instanceof Error ? err.message : 'No se pudo quitar la etiqueta. Probá de nuevo.')
      } finally {
        setTagBusySlug(null)
      }
    },
    [lead, localTags, tagBusySlug, onTagsChanged],
  )

  if (!open) return null

  const metrics = computeThreadMetrics(messages)

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Datos del contacto">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200" onClick={() => onOpenChange(false)} />

      <div
        className={cn(
          // `85dvh` y NO `85vh`. En iOS `vh` es el viewport GRANDE (barras
          // retraídas): 0,85 × 844 = 717px contra ~640-700px visibles. Como la hoja
          // está anclada abajo y crece hacia arriba, su cabecera —donde vive el
          // botón Cerrar— quedaba 20-80px POR ENCIMA del borde superior de la
          // pantalla, y el `sticky top-0` no salva porque se pega al techo de la
          // hoja, que está fuera de cuadro. Además la hoja tapaba todo lo visible,
          // así que tampoco quedaba overlay para tocar afuera: el usuario quedaba
          // encerrado en el panel (en un teléfono no hay Escape).
          // `pb-[var(--safe-b)]`: con viewport-fit=cover, el pie no puede quedar
          // debajo de la barra de gestos.
          'absolute inset-x-0 bottom-0 z-10 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t bg-background pb-[var(--safe-b)] shadow-2xl',
          'animate-in slide-in-from-bottom duration-300',
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:h-full sm:max-h-none sm:w-[400px]',
          'sm:rounded-none sm:rounded-l-2xl sm:border-t-0 sm:border-l sm:slide-in-from-bottom-0 sm:slide-in-from-right',
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={contactName ?? phone} size="lg" />
            <div>
              <p className="flex items-center gap-1.5 text-base font-semibold">
                {contactName ?? displayPhone(phone)}
                {lead?.lead_number != null && <span className="text-xs font-normal text-muted-foreground">#{lead.lead_number}</span>}
              </p>
              <PipelineStateChip state={pipelineState} className="mt-1" />
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* Etiquetas */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <TagIcon className="h-3.5 w-3.5" /> Etiquetas
            </h3>
            {!lead ? (
              <p className="text-xs text-muted-foreground">
                Esta conversación todavía no está vinculada a un lead — no se pueden agregar etiquetas acá.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  {localTags.map(t => (
                    <TagChip key={t.slug} tag={t} onRemove={tagBusySlug ? undefined : () => removeTag(t)} />
                  ))}
                  {tagCatalog.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={availableToAdd.length === 0 || Boolean(tagBusySlug)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                        >
                          <Plus className="h-3 w-3" /> Agregar
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {availableToAdd.map(t => (
                          <DropdownMenuItem key={t.slug} onSelect={() => addTag(t)}>
                            {t.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {tagBusySlug && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                {tagError && <p className="text-xs font-medium text-[color:var(--destructive)]">{tagError}</p>}
                {tagCatalog.length === 0 && localTags.length === 0 && (
                  <p className="text-xs text-muted-foreground">Todavía no hay etiquetas cargadas para asignar.</p>
                )}
              </>
            )}
          </section>

          {/* Datos de contacto */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Datos</h3>
            <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm hover:underline">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {displayPhone(phone)}
            </a>
            {leadDetail?.email && (
              <a href={`mailto:${leadDetail.email}`} className="flex items-center gap-2 text-sm hover:underline">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {leadDetail.email}
              </a>
            )}
            {/* Solo se afirma el origen una vez que la respuesta de `/api/leads/[id]` llegó de
                verdad — con `leadDetail` todavía en null (cargando, o el fetch falló) NO
                mostramos "Sin origen registrado": sería mentir. Mismo criterio que el resto
                del código evita el "Enviando…" deshonesto de WhatsApp (ver CLAUDE.md). */}
            {lead && leadDetail && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5" /> Origen: {sourceLabel(leadDetail.source)}
              </p>
            )}
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" /> Asesor: {advisorName ?? 'Sin asignar'}
            </p>
          </section>

          {/* Propiedad */}
          {property && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Propiedad consultada
              </h3>
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">{property.title ?? property.address}</p>
                <p className="text-xs text-muted-foreground">{property.address}</p>
                {propertyDetail?.asking_price != null && (
                  <p className="mt-1 text-sm font-semibold text-[color:var(--brand)]">
                    {formatMoney(propertyDetail.asking_price, propertyDetail.currency)} · {operationLabel(propertyDetail.operation_type)}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Métricas de la conversación */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Esta conversación
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border p-2">
                <dt className="text-muted-foreground">Primera respuesta</dt>
                <dd className="mt-0.5 font-medium">{metrics.firstResponseMs != null ? formatDuration(metrics.firstResponseMs) : 'Sin respuesta aún'}</dd>
              </div>
              <div className="rounded-lg border p-2">
                <dt className="text-muted-foreground">Tiempo medio de respuesta</dt>
                <dd className="mt-0.5 font-medium">{metrics.avgResponseMs != null ? formatDuration(metrics.avgResponseMs) : '—'}</dd>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border p-2">
                <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <dt className="text-muted-foreground">Del cliente</dt>
                  <dd className="font-medium">{metrics.inboundCount}</dd>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border p-2">
                <ArrowUpFromLine className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <dt className="text-muted-foreground">Del equipo</dt>
                  <dd className="font-medium">{metrics.outboundCount}</dd>
                </div>
              </div>
            </dl>
          </section>

          {/* Accesos directos */}
          <section className="flex flex-col gap-2">
            {property && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/properties/${property.id}`}>
                  <Building2 className="h-3.5 w-3.5" /> Ver ficha de la propiedad
                </Link>
              </Button>
            )}
            {lead && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/inbox?tab=campanas&lead=${lead.id}`}>
                  <MessageCircle className="h-3.5 w-3.5" /> Ver lead en el CRM
                </Link>
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

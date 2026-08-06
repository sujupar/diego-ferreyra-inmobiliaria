'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, Loader2 } from 'lucide-react'
import {
  COMMERCIAL_STATUSES, commercialStatusDef, validateStatusChange,
  type CommercialStatus,
} from '@/lib/properties/commercial-status'
import { formatMoney } from '@/lib/properties/detail-view'

interface StatusEvent {
  id: string
  from_status: string | null
  to_status: string
  reason: string | null
  sold_price: number | null
  sold_currency: string | null
  sold_at: string | null
  created_at: string
  changed_by_name: string | null
}

interface Props {
  propertyId: string
  current: CommercialStatus
  /** Moneda de publicación: es el default de la operación. */
  currency: string
  soldPrice: number | null
  soldCurrency: string | null
  soldAt: string | null
  onChanged: () => void
}

export function PropertyCommercialStatusCard({
  propertyId, current, currency, soldPrice, soldCurrency, soldAt, onChanged,
}: Props) {
  const def = commercialStatusDef(current)
  const [target, setTarget] = useState<CommercialStatus | null>(null)
  const [reason, setReason] = useState('')
  const [price, setPrice] = useState('')
  const [saleCurrency, setSaleCurrency] = useState(currency)
  const [saleDate, setSaleDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [events, setEvents] = useState<StatusEvent[]>([])

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/commercial-status`)
      if (!res.ok) return
      const { events } = await res.json()
      setEvents(Array.isArray(events) ? events : [])
    } catch { /* el historial es secundario: si falla, la tarjeta sigue usable */ }
  }, [propertyId])

  useEffect(() => { loadEvents() }, [loadEvents])

  function pick(next: CommercialStatus) {
    setTarget(next)
    setError(null)
    setReason('')
    setPrice('')
    setSaleCurrency(currency)
    setSaleDate('')
  }

  function cancel() {
    setTarget(null)
    setError(null)
  }

  async function confirm() {
    if (!target) return
    const parsedPrice = price.trim() === '' ? null : Number(price)
    const input = {
      from: current,
      to: target,
      reason: reason.trim() || null,
      soldPrice: parsedPrice,
      soldCurrency: target === 'vendida' ? saleCurrency : null,
      soldAt: saleDate || null,
    }
    const check = validateStatusChange(input)
    if (!check.ok) {
      setError(check.error ?? 'Revisá los datos.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/commercial-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: target,
          reason: input.reason,
          soldPrice: input.soldPrice,
          soldCurrency: input.soldCurrency,
          soldAt: input.soldAt,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'No se pudo guardar el estado.'); return }
      if (data?.warning) toast.warning(data.warning)
      else toast.success(`Marcada como ${commercialStatusDef(target).label.toLowerCase()}`)
      setTarget(null)
      await loadEvents()
      onChanged()
    } catch {
      setError('No se pudo guardar el estado. Revisá la conexión y volvé a intentar.')
    } finally {
      setSaving(false)
    }
  }

  const others = COMMERCIAL_STATUSES.filter(s => s.key !== current)

  return (
    <Card className="border-2">
      <CardContent className="py-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Estado de la propiedad</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${def.dot}`} />
              <span className="display text-xl">{def.label}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{def.description}</p>
            {current === 'vendida' && soldPrice != null && (
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">Vendida en </span>
                <strong className="tabular-n">{formatMoney(soldPrice, soldCurrency || currency)}</strong>
                {soldAt && <span className="text-muted-foreground"> · {soldAt}</span>}
              </p>
            )}
          </div>
        </div>

        {!target && (
          <div className="flex flex-wrap gap-2">
            {others.map(s => (
              <Button key={s.key} variant="outline" size="sm" onClick={() => pick(s.key)}>
                {s.label}
              </Button>
            ))}
          </div>
        )}

        {target && (
          <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Cambiar de </span>
              <strong>{def.label}</strong>
              <span className="text-muted-foreground"> a </span>
              <strong>{commercialStatusDef(target).label}</strong>
            </p>

            {target === 'vendida' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-sm">
                  <span className="eyebrow block mb-1">Precio real</span>
                  <input
                    aria-label="Precio real de la operación"
                    type="number" min="0" step="1000" value={price}
                    onChange={e => setPrice(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="eyebrow block mb-1">Moneda</span>
                  <select
                    aria-label="Moneda de la operación"
                    value={saleCurrency} onChange={e => setSaleCurrency(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                  >
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="eyebrow block mb-1">Fecha de la operación</span>
                  <input
                    aria-label="Fecha de la operación"
                    type="date" value={saleDate}
                    onChange={e => setSaleDate(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            <label className="text-sm block">
              <span className="eyebrow block mb-1">
                Motivo {current === 'vendida' ? '(obligatorio)' : '(opcional)'}
              </span>
              <input
                aria-label="Motivo del cambio"
                value={reason} onChange={e => setReason(e.target.value)}
                placeholder={current === 'vendida' ? 'Ej: la operación se cayó' : 'Ej: el propietario retiró la propiedad'}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>

            {error && <p className="text-sm text-[color:var(--destructive)]">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={confirm} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Confirmar cambio
              </Button>
              <Button variant="ghost" onClick={cancel} disabled={saving}>Cancelar</Button>
            </div>
          </div>
        )}

        {events.length > 0 && (
          <Collapsible className="border-t pt-3">
            <CollapsibleTrigger asChild>
              <button className="group w-full flex items-center justify-between text-left">
                <span className="eyebrow">Historial de estados ({events.length})</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-2">
              {events.map(e => (
                <div key={e.id} className="text-sm flex flex-wrap items-baseline gap-x-2">
                  <span className="tabular-n text-muted-foreground text-xs">
                    {new Date(e.created_at).toLocaleDateString('es-AR')}
                  </span>
                  <span>
                    {e.from_status ? `${commercialStatusDef(e.from_status).label} → ` : ''}
                    <strong>{commercialStatusDef(e.to_status).label}</strong>
                  </span>
                  {e.changed_by_name && <span className="text-muted-foreground text-xs">· {e.changed_by_name}</span>}
                  {e.sold_price != null && (
                    <span className="text-muted-foreground text-xs tabular-n">
                      · {formatMoney(e.sold_price, e.sold_currency || currency)}
                    </span>
                  )}
                  {e.reason && <span className="text-muted-foreground text-xs w-full">{e.reason}</span>}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

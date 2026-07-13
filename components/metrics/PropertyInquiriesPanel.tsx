'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import type { DateRange } from './DateRangePicker'

/** Shapes espejo del response de /api/metrics/property-inquiries (Task 7). */
interface CountRow {
  property_id: string
  address: string | null
  neighborhood: string | null
  assigned_to: string | null
  assigned_name: string | null
  total: number
  mercadolibre: number
  argenprop: number
  zonaprop: number
  last_inquiry_at: string | null
}

interface Summary {
  total: number
  matched: number
  unidentified: number
  mercadolibre: number
  argenprop: number
  zonaprop: number
}

interface UnidentifiedRow {
  id: string
  seq: number
  portal: string
  received_at: string | null
  created_at: string
  lead_name: string | null
  property_external_code: string | null
  property_url: string | null
  property_address: string | null
  raw_subject: string | null
}

interface PanelData {
  properties: CountRow[]
  summary: Summary
  unidentified: UnidentifiedRow[]
}

const PORTAL_LABELS: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  zonaprop: 'ZonaProp',
  argenprop: 'Argenprop',
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-AR') : '—'
}

const COLUMNS: Column<CountRow>[] = [
  {
    key: 'address',
    label: 'Propiedad',
    sortable: true,
    render: r => (
      <Link href={`/properties/${r.property_id}`} className="underline hover:text-[color:var(--brand)]">
        {r.address ?? '(sin dirección)'}
      </Link>
    ),
  },
  { key: 'neighborhood', label: 'Barrio', render: r => r.neighborhood ?? '—' },
  { key: 'assigned_name', label: 'Asesor', render: r => r.assigned_name ?? '—' },
  {
    key: 'total', label: 'Total', sortable: true, className: 'text-right',
    render: r => <span className="font-semibold tabular-nums">{r.total}</span>,
  },
  { key: 'mercadolibre', label: 'ML', sortable: true, className: 'text-right', render: r => <span className="tabular-nums">{r.mercadolibre}</span> },
  { key: 'zonaprop', label: 'ZP', sortable: true, className: 'text-right', render: r => <span className="tabular-nums">{r.zonaprop}</span> },
  { key: 'argenprop', label: 'AP', sortable: true, className: 'text-right', render: r => <span className="tabular-nums">{r.argenprop}</span> },
  { key: 'last_inquiry_at', label: 'Última', sortable: true, render: r => fmtDate(r.last_inquiry_at) },
]

function SummaryChip({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight && value > 0 ? 'border-amber-400/60 bg-amber-50 dark:bg-amber-950/20' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function PropertyInquiriesPanel({ range }: { range: DateRange }) {
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUnidentified, setShowUnidentified] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/metrics/property-inquiries?from=${range.from}&to=${range.to}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando consultas') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range.from, range.to])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consultas por propiedad</CardTitle>
        <p className="text-xs text-muted-foreground">
          Consultas de portales (MercadoLibre / ZonaProp / Argenprop) recibidas en el rango, agrupadas por propiedad captada.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        )}
        {loading && !data && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryChip label="Total" value={data.summary.total} />
              <SummaryChip label="Identificadas" value={data.summary.matched} />
              <SummaryChip label="Sin identificar" value={data.summary.unidentified} highlight />
              <SummaryChip label="MercadoLibre" value={data.summary.mercadolibre} />
              <SummaryChip label="ZonaProp" value={data.summary.zonaprop} />
              <SummaryChip label="Argenprop" value={data.summary.argenprop} />
            </div>

            <DataTable
              data={data.properties}
              columns={COLUMNS}
              getRowKey={r => r.property_id}
              emptyMessage="Sin consultas de portales en este período."
            />

            {data.summary.unidentified > 0 && (
              <div className="rounded-lg border border-amber-400/50">
                <button
                  type="button"
                  onClick={() => setShowUnidentified(v => !v)}
                  className="flex w-full items-center gap-2 p-3 text-sm font-medium text-left"
                >
                  {showUnidentified ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Sin propiedad identificada ({data.summary.unidentified})
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    consultas que no matchearon con ninguna propiedad — revisar el mapeo
                  </span>
                </button>
                {showUnidentified && (
                  <ul className="divide-y border-t">
                    {data.unidentified.map(u => (
                      <li key={u.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">#{u.seq}</span>
                        <Badge variant="outline" className="text-xs">{PORTAL_LABELS[u.portal] ?? u.portal}</Badge>
                        <span>{u.lead_name ?? '(sin nombre)'}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-md">
                          {u.property_address ?? u.property_url ?? (u.property_external_code ? `CÓD ${u.property_external_code}` : u.raw_subject) ?? ''}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{fmtDate(u.received_at ?? u.created_at)}</span>
                        <Link href="/inbox" className="text-xs underline text-[color:var(--brand)]">Ver en inbox</Link>
                      </li>
                    ))}
                    {data.unidentified.length < data.summary.unidentified && (
                      <li className="p-3 text-xs text-muted-foreground">
                        Mostrando las {data.unidentified.length} más recientes de {data.summary.unidentified}.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

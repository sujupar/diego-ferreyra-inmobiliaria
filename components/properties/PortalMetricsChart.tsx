'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MetricPoint {
  property_id: string
  portal: string
  date: string
  views: number
  contacts: number
  favorites: number
  whatsapps: number
}

const PORTAL_LABEL: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  argenprop: 'Argenprop',
  zonaprop: 'ZonaProp',
}

export function PortalMetricsChart({ propertyId }: { propertyId: string }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<MetricPoint[] | null>(null)

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/portal-metrics?days=${days}`)
      .then(r => r.json())
      .then(({ data }) => setData(data ?? []))
      .catch(() => setData([]))
  }, [propertyId, days])

  if (!data) return null

  const byPortal = data.reduce<Record<string, MetricPoint[]>>((acc, p) => {
    acc[p.portal] = acc[p.portal] ?? []
    acc[p.portal].push(p)
    return acc
  }, {})

  const totals = (rows: MetricPoint[]) =>
    rows.reduce(
      (a, r) => ({
        views: a.views + r.views,
        contacts: a.contacts + r.contacts,
        favorites: a.favorites + r.favorites,
        whatsapps: a.whatsapps + r.whatsapps,
      }),
      { views: 0, contacts: 0, favorites: 0, whatsapps: 0 },
    )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="display text-base">Métricas por portal</CardTitle>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-xs border rounded px-2 py-1 bg-background"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(byPortal).map(([portal, rows]) => {
          const t = totals(rows)
          return (
            <div key={portal}>
              <h4 className="text-sm font-medium mb-2">{PORTAL_LABEL[portal] ?? portal}</h4>
              <div className="grid grid-cols-4 gap-3 text-center">
                <Metric label="Vistas" value={t.views} />
                <Metric label="Contactos" value={t.contacts} />
                <Metric label="Favoritos" value={t.favorites} />
                <Metric label="WhatsApp" value={t.whatsapps} />
              </div>
            </div>
          )
        })}
        {Object.keys(byPortal).length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no hay métricas disponibles. Se sincronizan cada 6 h una vez publicado el aviso.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-medium tabular-nums">{value}</p>
    </div>
  )
}

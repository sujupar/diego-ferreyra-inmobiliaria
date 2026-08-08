'use client'

import type { CampaignFunnelRow, FunnelType } from '@/lib/metrics/types'

const GROUPS: { type: FunnelType; label: string }[] = [
  { type: 'clase_gratuita', label: 'Campañas — Clase gratuita' },
  { type: 'tasacion',       label: 'Campañas — Solicitud de tasación' },
  { type: 'otro',           label: 'Otras campañas' },
]

function fmtMoney(v: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(v)
}

function fmtPct(v: number, digits = 2): string {
  return `${v.toFixed(digits)}%`
}

export function CampaignBreakdown({ rows }: { rows: CampaignFunnelRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de Meta Ads para el rango.</p>
  }

  return (
    <div className="space-y-6">
      {GROUPS.map(g => {
        const slice = rows.filter(r => r.funnel_type === g.type)
        if (slice.length === 0) return null

        const totals = slice.reduce(
          (a, r) => ({
            impressions: a.impressions + r.impressions,
            landing_page_views: a.landing_page_views + r.landing_page_views,
            spend: a.spend + r.spend,
            registrations: a.registrations + r.registrations,
          }),
          { impressions: 0, landing_page_views: 0, spend: 0, registrations: 0 },
        )
        const ctr = totals.impressions > 0 ? (totals.landing_page_views / totals.impressions) * 100 : 0
        const cpr = totals.registrations > 0 ? totals.spend / totals.registrations : null

        return (
          <section key={g.type}>
            <h3 className="text-base font-semibold mb-2">{g.label}</h3>
            {/* Sin contenedor rounded-xl/border/bg-card propio: el padre
                (`/metrics`) ya pone esta tabla adentro de un `<Card>` —
                agregarle el marco de `DataTable` la anidaría dos veces
                (lección de la Tarea 9). Cabecera `eyebrow`, filas separadas
                por `border-t`, `tabular-n` en las columnas de números. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 eyebrow whitespace-nowrap">Campaña</th>
                    <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">Impresiones</th>
                    <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">Visitas a la página</th>
                    <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">CTR</th>
                    <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">Gasto</th>
                    <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">Registros</th>
                    <th className="text-right py-2 px-3 eyebrow whitespace-nowrap">$/Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map(r => (
                    <tr key={r.campaign_id} className="border-t hover:bg-muted/40">
                      <td className="py-2 px-3">{r.campaign_name || r.campaign_id}</td>
                      <td className="py-2 px-3 text-right tabular-n">{r.impressions}</td>
                      <td className="py-2 px-3 text-right tabular-n">{r.landing_page_views}</td>
                      <td className="py-2 px-3 text-right tabular-n">{fmtPct(r.ctr)}</td>
                      <td className="py-2 px-3 text-right tabular-n">${fmtMoney(r.spend)}</td>
                      <td className="py-2 px-3 text-right tabular-n">{r.registrations}</td>
                      <td className="py-2 px-3 text-right tabular-n">
                        {r.cost_per_registration != null ? `$${fmtMoney(r.cost_per_registration)}` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold bg-muted/30">
                    <td className="py-2 px-3">Total</td>
                    <td className="py-2 px-3 text-right tabular-n">{totals.impressions}</td>
                    <td className="py-2 px-3 text-right tabular-n">{totals.landing_page_views}</td>
                    <td className="py-2 px-3 text-right tabular-n">{fmtPct(ctr)}</td>
                    <td className="py-2 px-3 text-right tabular-n">${fmtMoney(totals.spend)}</td>
                    <td className="py-2 px-3 text-right tabular-n">{totals.registrations}</td>
                    <td className="py-2 px-3 text-right tabular-n">
                      {cpr != null ? `$${fmtMoney(cpr)}` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}

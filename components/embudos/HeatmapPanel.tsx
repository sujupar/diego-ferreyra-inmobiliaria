'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Flame } from 'lucide-react'

export interface HeatSectionRow {
  page: string
  section: string
  segment: string
  stage: string | null
  device: string
  reached: number
  avg_visible_ms: number
  clicks: number
}
export interface HeatTotalRow {
  page: string
  segment: string
  stage: string | null
  device: string
  sessions: number
  avg_scroll: number
}
export interface HeatGridRow {
  page: string
  section: string
  segment: string
  device: string
  x_bin: number
  y_bin: number
  clicks: number
  rage: number
}

const SECTION_ORDER: Record<string, string[]> = {
  tasacion: ['topbar', 'hero', 'benefits', 'stat', 'testimonios', 'cta-final', 'footer'],
  clase: ['topbar', 'hero', 'social-proof', 'bio', 'cta-final', 'footer'],
}
const SECTION_LABELS: Record<string, string> = {
  topbar: 'Barra superior',
  hero: 'Hero (video + título)',
  benefits: 'Beneficios',
  stat: 'Estadística',
  testimonios: 'Testimonios',
  'social-proof': 'Prueba social',
  bio: 'Quién soy',
  'cta-final': 'CTA final',
  footer: 'Pie',
}
const STAGE_LABELS: Record<string, string> = {
  request: 'Solicitud', scheduled: 'Coordinada', not_visited: 'No realizada', visited: 'Visita realizada',
  appraisal_sent: 'Tasación entregada', followup: 'Seguimiento', captured: 'Captada', lost: 'Descartado',
  clase_gratuita: 'Clase gratuita', comprador: 'Comprador',
}
const NUM = new Intl.NumberFormat('es-AR')

function matchSeg(row: { segment: string; stage: string | null }, f: string): boolean {
  if (f === 'all') return true
  if (f === 'anon') return row.segment === 'no_registrado'
  if (f === 'reg') return row.segment === 'registrado'
  if (f.startsWith('stage:')) return row.segment === 'registrado' && row.stage === f.slice(6)
  return true
}
const matchDev = (d: string, f: string) => f === 'all' || d === f

export function HeatmapPanel({
  page,
  sections,
  totals,
}: {
  page: string
  sections: HeatSectionRow[]
  totals: HeatTotalRow[]
}) {
  const [seg, setSeg] = useState('all')
  const [dev, setDev] = useState('all')

  if (totals.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de mapa de calor para el rango.</p>
  }

  const stages = Array.from(new Set(totals.filter((t) => t.segment === 'registrado' && t.stage).map((t) => t.stage as string)))
  const totalSessions = totals.filter((t) => matchSeg(t, seg) && matchDev(t.device, dev)).reduce((s, t) => s + t.sessions, 0)
  const order = SECTION_ORDER[page] ?? Array.from(new Set(sections.map((s) => s.section)))

  // v1 — por sección: % que llegó + tiempo medio + clics
  const rows = order.map((key) => {
    const matched = sections.filter((r) => r.section === key && matchSeg(r, seg) && matchDev(r.device, dev))
    const reached = matched.reduce((s, r) => s + r.reached, 0)
    const clicks = matched.reduce((s, r) => s + r.clicks, 0)
    const msW = matched.reduce((s, r) => s + Number(r.avg_visible_ms) * r.reached, 0)
    const avgMs = reached > 0 ? msW / reached : 0
    const pct = totalSessions > 0 ? Math.round((reached / totalSessions) * 100) : 0
    return { key, reached, clicks, avgSec: Math.round(avgMs / 100) / 10, pct }
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Mapa de calor · {NUM.format(totalSessions)} sesiones
        </p>
        <div className="flex items-center gap-2">
          <select value={dev} onChange={(e) => setDev(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-xs" aria-label="Dispositivo">
            <option value="all">Todo dispositivo</option>
            <option value="desktop">Escritorio</option>
            <option value="mobile">Mobile</option>
            <option value="tablet">Tablet</option>
          </select>
          <select value={seg} onChange={(e) => setSeg(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-xs" aria-label="Segmento">
            <option value="all">Todos</option>
            <option value="anon">No registrados</option>
            <option value="reg">Registrados</option>
            {stages.map((s) => (
              <option key={s} value={`stage:${s}`}>{`Etapa: ${STAGE_LABELS[s] || s}`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* v1 — embudo de secciones (scroll + tiempo + clics) */}
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].pct : r.pct
          const drop = prev - r.pct
          return (
            <div key={r.key} className="flex items-center gap-2 text-xs">
              <span className="w-36 shrink-0 truncate text-muted-foreground" title={SECTION_LABELS[r.key] || r.key}>
                {SECTION_LABELS[r.key] || r.key}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary/80" style={{ width: `${r.pct}%` }} />
                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-medium text-foreground">
                  {r.pct}%
                </span>
              </div>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground" title="Tiempo promedio visible">
                {r.avgSec}s
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground" title="Clics">
                {NUM.format(r.clicks)} clic
              </span>
              <span className={`w-12 shrink-0 text-right tabular-nums ${drop > 15 ? 'text-rose-600' : 'text-muted-foreground/60'}`} title="Caída vs sección anterior">
                {i > 0 && drop > 0 ? `-${drop}%` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {/* El "dónde hacen clic" visual vive en el visor sobre la página real. */}
      <Link
        href={`/embudos/heatmap/${page}`}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50/50 px-4 py-3 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
      >
        <Flame className="h-4 w-4" />
        Ver mapa de calor sobre la página
      </Link>
    </div>
  )
}

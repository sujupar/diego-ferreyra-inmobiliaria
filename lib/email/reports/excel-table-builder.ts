/**
 * Excel-table-builder — produce HTML denso estilo planilla de Excel para
 * embeber en emails de reportes. Sin colores fancy, sin cards, sin imágenes
 * decorativas. El objetivo es facilitar la comparación visual rápida estilo
 * spreadsheet (border-collapse, alineación a la derecha en números, header
 * gris claro, filas con hover sutil).
 *
 * Este módulo es plain JS — usable también desde Netlify scheduled functions
 * que NO pueden importar @/-aliases (ver netlify/functions/*.mts).
 */

export interface ExcelTableSection {
  title: string
  columns: string[]
  /** Filas. Cada celda es string ya formateado por el caller. */
  rows: string[][]
  /**
   * Para delta % col: si el string comienza con `+`, se pinta verde; con `-`,
   * rojo. Override por celda con prefix `[g]`, `[r]`, `[m]` (muted).
   */
  emptyMessage?: string
}

const TH_STYLE = 'padding:6px 10px;border:1px solid #9ca3af;background:#e5e7eb;color:#374151;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;'
const TD_STYLE = 'padding:6px 10px;border:1px solid #d1d5db;font-size:13px;color:#1f2937;'

function tdCell(value: string, opts: { align: 'left' | 'right'; bold?: boolean } = { align: 'left' }): string {
  // Color overrides via prefix tag
  let color: string | undefined
  let text = value
  if (text.startsWith('[g]')) { color = '#15803d'; text = text.slice(3) }
  else if (text.startsWith('[r]')) { color = '#dc2626'; text = text.slice(3) }
  else if (text.startsWith('[m]')) { color = '#9ca3af'; text = text.slice(3) }
  else if (/^\+\d/.test(text))     { color = '#15803d' }
  else if (/^-\d/.test(text))      { color = '#dc2626' }

  const styleParts = [
    TD_STYLE,
    `text-align:${opts.align};`,
    opts.bold ? 'font-weight:600;' : '',
    color ? `color:${color};` : '',
  ].join('')
  // Escapar HTML básico (los callers pasan strings ya construidos pero por
  // seguridad escapamos < > & en el texto final).
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<td style="${styleParts}">${safe}</td>`
}

export function buildExcelTable(section: ExcelTableSection): string {
  if (section.rows.length === 0) {
    return `<h3 style="font-family:Arial,sans-serif;margin:18px 0 6px 0;font-size:14px;color:#111827;">${section.title}</h3>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#6b7280;margin:0 0 18px 0;">${section.emptyMessage ?? 'Sin datos.'}</p>`
  }

  const head = section.columns.map((c, i) =>
    `<th style="${TH_STYLE}text-align:${i === 0 ? 'left' : 'right'};">${c}</th>`,
  ).join('')

  const body = section.rows.map(r => {
    const cells = r.map((v, i) => tdCell(v, { align: i === 0 ? 'left' : 'right', bold: i === 0 })).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  return `<h3 style="font-family:Arial,sans-serif;margin:18px 0 6px 0;font-size:14px;color:#111827;">${section.title}</h3>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;width:100%;max-width:720px;margin-bottom:18px;">
  <thead><tr>${head}</tr></thead>
  <tbody>${body}</tbody>
</table>`
}

export interface ExcelReportOptions {
  title: string
  preheader: string
  sections: ExcelTableSection[]
}

export function buildExcelReport(opts: ExcelReportOptions): string {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${opts.title}</title>
</head>
<body style="background:#f9fafb;margin:0;padding:24px;font-family:Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f9fafb;">${opts.preheader}${'&nbsp;'.repeat(80)}</div>
<div style="max-width:760px;margin:0 auto;background:#ffffff;padding:24px 28px;border:1px solid #e5e7eb;border-radius:6px;">
  <h1 style="font-family:Arial,sans-serif;font-size:18px;margin:0 0 4px 0;color:#111827;">${opts.title}</h1>
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#6b7280;margin:0 0 14px 0;">${opts.preheader}</p>
  ${opts.sections.map(buildExcelTable).join('')}
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px;">Generado automáticamente · Diego Ferreyra Inmobiliaria</p>
</div></body></html>`
}

/** Formatea delta % con signo y emoji-free (compat email clients). */
export function formatDelta(current: number, previous: number): string {
  if (current === 0 && previous === 0) return '—'
  if (previous === 0) return '+∞'
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return '0%'
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

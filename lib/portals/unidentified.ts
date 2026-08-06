/**
 * Agrupa las consultas SIN identificar por aviso.
 *
 * El punto de la feature: 43 consultas pendientes vienen de 13 avisos. La
 * coordinadora trabaja por AVISO (identificar uno arregla todas sus consultas,
 * pasadas y futuras), así que la UI muestra avisos, no consultas.
 *
 * Puro y testeable: la ruta le pasa las filas y muestra lo que devuelve.
 */

export interface UnidentifiedInquiryRow {
  portal: string
  property_external_code: string | null
  raw_subject: string | null
  lead_name: string | null
  created_at: string
  received_at: string | null
}

export interface UnidentifiedAviso {
  portal: string
  externalCode: string
  title: string | null
  inquiryCount: number
  lastInquiryAt: string
  lastLeadName: string | null
}

/**
 * Título legible desde el asunto de ZonaProp:
 *   "📩 ¡Recibiste una nueva consulta por el aviso <TÍTULO>! CÓD:XXXX - REF:#N#"
 * Argenprop no lo trae con ese formato → null (la UI muestra solo el código).
 */
export function titleFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null
  const m = subject.match(/aviso\s+(.+?)\s*\.{0,3}!?\s*C[ÓO]D:/i)
  const title = m?.[1]?.trim().replace(/[.\u2026\s]+$/, '')
  return title ? title : null
}

export function groupUnidentified(rows: UnidentifiedInquiryRow[]): UnidentifiedAviso[] {
  const byAviso = new Map<string, UnidentifiedAviso>()

  for (const r of rows) {
    const code = r.property_external_code?.trim()
    if (!code) continue // sin código no hay aviso que identificar
    const key = `${r.portal}::${code}`
    const existing = byAviso.get(key)
    const isNewer = !existing || r.created_at > existing.lastInquiryAt

    if (!existing) {
      byAviso.set(key, {
        portal: r.portal,
        externalCode: code,
        title: titleFromSubject(r.raw_subject),
        inquiryCount: 1,
        lastInquiryAt: r.created_at,
        lastLeadName: r.lead_name,
      })
      continue
    }

    existing.inquiryCount++
    if (isNewer) {
      existing.lastInquiryAt = r.created_at
      existing.lastLeadName = r.lead_name
    }
    // El título puede faltar en algunos asuntos; nos quedamos con el primero que aparezca.
    if (!existing.title) existing.title = titleFromSubject(r.raw_subject)
  }

  return [...byAviso.values()].sort(
    (a, b) => b.inquiryCount - a.inquiryCount || b.lastInquiryAt.localeCompare(a.lastInquiryAt),
  )
}

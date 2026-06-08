// types/legal-docs.types.ts
// Catálogo de documentos legales requeridos, condicionales y opcionales.

export type LegalDocCategory = 'mandatory' | 'temporal' | 'optional'

export interface LegalDocDefinition {
  key: string
  label: string
  category: LegalDocCategory
  description?: string
  condition?: 'succession' | 'divorce' | 'powers' | 'credit_purchase' | 'apt_or_ph'
  alertDaysRemaining?: number // para temporales, cuántos días antes alertar
}

export const LEGAL_DOCS_CATALOG: LegalDocDefinition[] = [
  // OBLIGATORIOS
  { key: 'autorizacion_firmada', label: 'Autorización Firmada', category: 'mandatory', description: 'Autorización del propietario firmada para comercializar la propiedad.' },
  { key: 'dni_titulares', label: 'DNI de los Titulares', category: 'mandatory', description: 'Copia de DNI de todos los titulares.' },
  { key: 'escritura', label: 'Escritura de la Propiedad', category: 'mandatory', description: 'Escritura vigente.' },

  // CONDICIONALES (obligatorios si aplica la condición)
  { key: 'declaratoria_herederos', label: 'Declaratoria de Herederos', category: 'mandatory', condition: 'succession', description: 'Obligatorio si hay sucesión.' },
  { key: 'sentencia_divorcio', label: 'Sentencia de Divorcio', category: 'mandatory', condition: 'divorce', description: 'Obligatorio si hay divorcio.' },

  // TEMPORALES (obligatorios con alertas)
  { key: 'reglamento', label: 'Reglamento de Copropiedad', category: 'temporal', condition: 'apt_or_ph', description: 'Requerido para departamentos y PH.', alertDaysRemaining: 15 },
  { key: 'plano', label: 'Plano de la Propiedad', category: 'temporal', description: 'Plano de la propiedad (siempre requerido para tasación y comercialización).', alertDaysRemaining: 15 },
  { key: 'poderes', label: 'Poderes', category: 'temporal', condition: 'powers', description: 'Requerido si hay representación por poder.', alertDaysRemaining: 15 },

  // OPCIONALES
  { key: 'estado_parcelario', label: 'Estado Parcelario', category: 'optional', description: 'Opcional. Aplica a PH, casa en provincia o casa en CABA.' },
  { key: 'servicio_agua', label: 'Servicio de Agua (AySA)', category: 'optional', description: 'Última factura paga del servicio de agua.' },
  { key: 'servicio_luz', label: 'Servicio de Luz (Edenor / Edesur)', category: 'optional', description: 'Última factura paga del servicio eléctrico.' },
  { key: 'servicio_gas', label: 'Servicio de Gas (Metrogas / Naturgy)', category: 'optional', description: 'Última factura paga del servicio de gas.' },
  { key: 'abl', label: 'ABL / Impuesto Inmobiliario', category: 'optional', description: 'Última boleta paga de ABL (CABA) o impuesto inmobiliario (provincia).' },
]

export type DocItemStatus = 'missing' | 'pending' | 'approved' | 'rejected'

export interface DocItemState {
  file_url?: string
  file_name?: string
  uploaded_at?: string
  status: DocItemStatus
  reviewer_notes?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
}

export interface LegalDocsState {
  [item_key: string]: DocItemState
}

export interface LegalFlags {
  has_succession: boolean
  has_divorce: boolean
  has_powers: boolean
  is_credit_purchase: boolean
}

export function getApplicableDocs(flags: LegalFlags, propertyType: string): LegalDocDefinition[] {
  return LEGAL_DOCS_CATALOG.filter(d => {
    if (!d.condition) return true
    if (d.condition === 'succession') return flags.has_succession
    if (d.condition === 'divorce') return flags.has_divorce
    if (d.condition === 'powers') return flags.has_powers
    if (d.condition === 'credit_purchase') return flags.is_credit_purchase
    if (d.condition === 'apt_or_ph') return propertyType === 'departamento' || propertyType === 'apt' || propertyType === 'ph'
    return true
  })
}

export type LegalSummaryTone = 'ok' | 'warn' | 'bad'

export interface LegalDocsSummary {
  approved: number
  pending: number
  rejected: number
  missing: number
  total: number
  tone: LegalSummaryTone
  label: string
}

/**
 * Resume el estado de los documentos APLICABLES para mostrarlo en el
 * encabezado plegado de la sección legal. `applicableKeys` son las keys
 * que devuelve getApplicableDocs() para esta propiedad.
 */
export function summarizeLegalDocs(docs: LegalDocsState, applicableKeys: string[]): LegalDocsSummary {
  let approved = 0, pending = 0, rejected = 0, missing = 0
  for (const key of applicableKeys) {
    const status = docs[key]?.status ?? 'missing'
    if (status === 'approved') approved++
    else if (status === 'pending') pending++
    else if (status === 'rejected') rejected++
    else missing++
  }
  const total = applicableKeys.length
  let tone: LegalSummaryTone
  let label: string
  if (rejected > 0) {
    tone = 'bad'
    label = `${rejected} rechazado${rejected !== 1 ? 's' : ''} · revisar`
  } else if (pending + missing > 0) {
    tone = 'warn'
    label = `${approved}/${total} aprobados`
  } else {
    tone = 'ok'
    label = `${total}/${total} aprobados`
  }
  return { approved, pending, rejected, missing, total, tone, label }
}

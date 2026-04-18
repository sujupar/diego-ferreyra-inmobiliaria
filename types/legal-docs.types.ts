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
  { key: 'plano', label: 'Plano de la Propiedad', category: 'temporal', condition: 'credit_purchase', description: 'Requerido si el comprador adquiere con crédito.', alertDaysRemaining: 15 },
  { key: 'poderes', label: 'Poderes', category: 'temporal', condition: 'powers', description: 'Requerido si hay representación por poder.', alertDaysRemaining: 15 },

  // OPCIONALES
  { key: 'estado_parcelario', label: 'Estado Parcelario', category: 'optional', description: 'Opcional. Aplica a PH, casa en provincia o casa en CABA.' },
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

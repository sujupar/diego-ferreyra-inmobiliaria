/**
 * Tipos compartidos del pipeline de consultas de portales.
 *
 * NOTA: estos parsers son HEURÍSTICOS y best-effort. Están construidos sobre la
 * estructura conocida de los emails de notificación de ML/ZonaProp/Argenprop,
 * pero DEBEN calibrarse con 2-3 emails reales por portal (ver tests). La
 * extracción genérica (email/teléfono/URL/labels) cubre la mayoría de los casos
 * aunque el formato cambie; los campos específicos por portal son los frágiles.
 */

export type Portal = 'mercadolibre' | 'zonaprop' | 'argenprop'

/** Canal por el que llegó la consulta (como en la captura: "Tipo: Mail/WhatsApp"). */
export type InquiryType = 'mail' | 'whatsapp' | 'phone'

export interface RawEmail {
  subject: string
  from: string
  text: string
  html: string
}

export interface ParsedInquiry {
  portal: Portal
  inquiryType: InquiryType
  leadName: string | null
  leadEmail: string | null
  leadPhone: string | null
  message: string | null
  propertyCode: string | null // ID/código del aviso en el portal
  propertyUrl: string | null
  propertyAddress: string | null
  propertyTitle: string | null
}

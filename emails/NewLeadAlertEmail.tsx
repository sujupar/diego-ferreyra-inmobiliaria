import 'server-only'
import * as React from 'react'
import { EmailLayout, BASE_URL } from './_components/EmailLayout'

/**
 * Email de alerta de lead nuevo para el asesor.
 *
 * A diferencia del LeadNotificationEmail genérico (estilo operacional), este
 * email está optimizado para CONVERSIÓN COMERCIAL — la velocidad de respuesta
 * de un asesor a un lead Meta caliente determina ~80% de la conversión.
 *
 * Diferencias clave vs el resto de notifications:
 *   - Hero con foto principal de la propiedad (no logo arriba).
 *   - CTAs gigantes "Llamar" + "WhatsApp" con tel: y wa.me links (mobile-first).
 *   - Datos del contacto prominentes y copy-friendly.
 *   - Tono urgente sin ser agresivo.
 *   - Mensaje del lead destacado (si hay).
 *   - Footer con contexto de la campaña (UTMs).
 */

export interface NewLeadAlertEmailProps {
  advisorFirstName: string
  propertyId: string
  propertyAddress: string
  propertyTitle: string | null
  neighborhood: string | null
  photoUrl: string | null
  askingPrice: number | null
  currency: string
  leadName: string
  leadEmail: string | null
  leadPhone: string | null
  leadMessage: string | null
  source: string
  utm: Record<string, string>
  createdAt: string
  testMode?: boolean
  originalRecipients?: string[]
}

const BRAND = '#2A3B84'
const URGENT = '#DC2626'
const URGENT_SOFT = '#FEE2E2'
const SUCCESS = '#16A34A'
const SUCCESS_SOFT = '#DCFCE7'
const TEXT = '#1B1F2A'
const MUTED = '#6B7280'
const BORDER = '#E5E7EB'

const SOURCE_LABEL: Record<string, string> = {
  landing: 'Landing pública',
  meta_form: 'Meta Ads',
  portal_mercadolibre: 'MercadoLibre',
  portal_argenprop: 'Argenprop',
  portal_zonaprop: 'ZonaProp',
}

/**
 * Normaliza un teléfono argentino a formato wa.me (solo dígitos, código país).
 *
 * Casos manejados:
 *  - "+54 9 11 1234-5678" → "5491112345678"
 *  - "011 1234-5678"      → "5411123456 78" (strip '0' trunk + prepend 54)
 *  - "11 1234-5678"       → "541112345678"
 *  - "5491112345678"      → "5491112345678" (ya correcto)
 *
 * Sin el strip del '0' inicial, números argentinos en formato local quedaban
 * como `5401112345678` (con doble 0/54 inválido para WhatsApp).
 */
function normalizePhoneForWhatsapp(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return ''
  // Strip trunk prefix '0' (ej: '011XXXX' → '11XXXX') antes de chequear código país
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('54')) return `54${digits}`
  return digits
}

function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function NewLeadAlertEmail(props: NewLeadAlertEmailProps) {
  const preheader = `${props.leadName} preguntó por ${props.propertyTitle ?? props.propertyAddress}. Contactalo ahora.`
  const sourceLabel = SOURCE_LABEL[props.source] ?? props.source
  const utmEntries = Object.entries(props.utm).filter(([, v]) => v)
  const propertyName = props.propertyTitle ?? props.propertyAddress
  const phoneDigits = props.leadPhone ? normalizePhoneForWhatsapp(props.leadPhone) : null
  const propertyDetailUrl = `${BASE_URL()}/properties/${props.propertyId}`

  return (
    <EmailLayout
      preheader={preheader}
      testMode={props.testMode}
      originalRecipients={props.originalRecipients}
      recipientRole="asesor"
    >
      {/* Hero con urgencia */}
      <div
        style={{
          backgroundColor: URGENT_SOFT,
          borderRadius: 8,
          padding: '14px 16px',
          margin: '0 0 18px 0',
          textAlign: 'center' as const,
          borderLeft: `4px solid ${URGENT}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: URGENT,
            letterSpacing: 1,
            textTransform: 'uppercase' as const,
            marginBottom: 4,
          }}
        >
          ⚡ Lead caliente · {sourceLabel}
        </div>
        <div style={{ fontSize: 13, color: TEXT }}>
          La primera respuesta dentro de los 5 minutos triplica la conversión.
        </div>
      </div>

      <div style={{ fontSize: 16, color: TEXT, marginBottom: 16 }}>
        Hola <strong>{props.advisorFirstName}</strong>,{' '}
        <strong>{props.leadName}</strong> quiere ver tu propiedad:
      </div>

      {/* Tarjeta de propiedad con foto hero */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        width="100%"
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        <tbody>
          {props.photoUrl && (
            <tr>
              <td style={{ padding: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={props.photoUrl}
                  alt={propertyName}
                  width="600"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: 240,
                    objectFit: 'cover' as const,
                    border: 0,
                  }}
                />
              </td>
            </tr>
          )}
          <tr>
            <td style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
                {propertyName}
              </div>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
                {props.propertyAddress}
                {props.neighborhood ? ` · ${props.neighborhood}` : ''}
              </div>
              {props.askingPrice != null && props.askingPrice > 0 && (
                <div style={{ fontSize: 16, fontWeight: 700, color: BRAND }}>
                  {formatPrice(props.askingPrice, props.currency)}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* CTAs grandes mobile-first */}
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 10 }}>
        Contactalo ahora:
      </div>

      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          <tr>
            {props.leadPhone && (
              <td
                width="50%"
                style={{ paddingRight: 6, paddingBottom: 8, verticalAlign: 'top' as const }}
              >
                <a
                  href={`tel:${props.leadPhone}`}
                  style={{
                    display: 'block',
                    backgroundColor: BRAND,
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: 15,
                    padding: '14px 12px',
                    borderRadius: 8,
                    textAlign: 'center' as const,
                  }}
                >
                  📞 Llamar
                </a>
              </td>
            )}
            {phoneDigits && (
              <td
                width="50%"
                style={{ paddingLeft: 6, paddingBottom: 8, verticalAlign: 'top' as const }}
              >
                <a
                  href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(
                    `Hola ${props.leadName}, soy ${props.advisorFirstName} de Diego Ferreyra Inmobiliaria. Recibí tu consulta sobre ${propertyName}.`,
                  )}`}
                  style={{
                    display: 'block',
                    backgroundColor: SUCCESS,
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: 15,
                    padding: '14px 12px',
                    borderRadius: 8,
                    textAlign: 'center' as const,
                  }}
                >
                  💬 WhatsApp
                </a>
              </td>
            )}
          </tr>
          {props.leadEmail && (
            <tr>
              <td colSpan={2} style={{ paddingBottom: 8 }}>
                <a
                  href={`mailto:${props.leadEmail}`}
                  style={{
                    display: 'block',
                    backgroundColor: '#FFFFFF',
                    color: BRAND,
                    border: `1.5px solid ${BRAND}`,
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: 14,
                    padding: '12px',
                    borderRadius: 8,
                    textAlign: 'center' as const,
                  }}
                >
                  ✉ Mandarle email
                </a>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Datos del contacto en formato compacto */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        width="100%"
        style={{
          backgroundColor: SUCCESS_SOFT,
          borderRadius: 8,
          marginTop: 18,
          marginBottom: 18,
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: '14px 16px' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#166534',
                  letterSpacing: 0.5,
                  textTransform: 'uppercase' as const,
                  marginBottom: 8,
                }}
              >
                Datos del contacto
              </div>
              <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.7 }}>
                <strong>Nombre:</strong> {props.leadName}
                <br />
                {props.leadPhone && (
                  <>
                    <strong>Teléfono:</strong> {props.leadPhone}
                    <br />
                  </>
                )}
                {props.leadEmail && (
                  <>
                    <strong>Email:</strong> {props.leadEmail}
                    <br />
                  </>
                )}
                <strong>Recibido:</strong> {props.createdAt}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Mensaje del lead destacado */}
      {props.leadMessage && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
            Mensaje del cliente:
          </div>
          <div
            style={{
              backgroundColor: '#F9FAFB',
              borderLeft: `4px solid ${BRAND}`,
              padding: '14px 16px',
              borderRadius: 4,
              fontSize: 14,
              color: TEXT,
              lineHeight: 1.6,
              fontStyle: 'italic' as const,
              whiteSpace: 'pre-wrap' as const,
              marginBottom: 18,
            }}
          >
            “{props.leadMessage}”
          </div>
        </>
      )}

      {/* Enlace al detalle interno */}
      <div style={{ textAlign: 'center' as const, marginBottom: 18 }}>
        <a
          href={propertyDetailUrl}
          style={{
            color: BRAND,
            fontSize: 13,
            textDecoration: 'underline',
          }}
        >
          Ver ficha interna de la propiedad →
        </a>
      </div>

      {/* Origen de campaña (utm) */}
      {utmEntries.length > 0 && (
        <div
          style={{
            backgroundColor: '#F9FAFB',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 11,
            color: MUTED,
            marginBottom: 12,
          }}
        >
          <strong style={{ color: TEXT }}>De dónde vino:</strong>{' '}
          {utmEntries.map(([k, v]) => `${k}=${v}`).join(' · ')}
        </div>
      )}

      <div
        style={{
          fontSize: 12,
          color: MUTED,
          textAlign: 'center' as const,
          paddingTop: 12,
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        Si no podés tomar este lead, avisale al coordinador para reasignarlo.
      </div>
    </EmailLayout>
  )
}

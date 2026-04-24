import 'server-only'
import * as React from 'react'

const BRAND = '#2A3B84'
const BRAND_SOFT = '#EEF0FB'
const FOREGROUND = '#1B1F2A'
const MUTED = '#6B7280'
const BACKGROUND = '#FAFAF9'
const TEST_BG = '#FEF3C7'
const TEST_FG = '#92400E'

const LOGO_URL = 'https://storage.googleapis.com/msgsndr/Zd3mW81lbIpC8mi06Cgf/media/682c6cc8e10a088724d26be6.png'

export interface EmailLayoutProps {
  preheader?: string
  testMode?: boolean
  originalRecipients?: string[]
  recipientRole?: string
  children: React.ReactNode
}

export function EmailLayout({ preheader, testMode, originalRecipients, recipientRole, children }: EmailLayoutProps) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>Diego Ferreyra Inmobiliaria</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: BACKGROUND, color: FOREGROUND, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
        {/* Preheader oculto — lo muestran Gmail/Outlook bajo el subject */}
        {preheader && (
          <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', fontSize: '1px', lineHeight: '1px', color: BACKGROUND }}>
            {preheader}
            {'\u00A0'.repeat(100)}
          </div>
        )}
        <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ backgroundColor: BACKGROUND }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '24px 12px' }}>
                <table role="presentation" cellPadding={0} cellSpacing={0} width="600" style={{ maxWidth: 600, width: '100%', backgroundColor: '#FFFFFF', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <tbody>
                    {/* Franja superior brand */}
                    <tr><td style={{ height: 3, backgroundColor: BRAND, borderTopLeftRadius: 10, borderTopRightRadius: 10 }}></td></tr>

                    {/* Header con logo */}
                    <tr>
                      <td style={{ padding: '20px 28px', borderBottom: `1px solid ${BRAND_SOFT}` }}>
                        <img src={LOGO_URL} alt="Diego Ferreyra Inmobiliaria" width="140" style={{ display: 'block', border: 0, maxWidth: '140px', height: 'auto' }} />
                      </td>
                    </tr>

                    {/* Banner MODO PRUEBA */}
                    {testMode && (
                      <tr>
                        <td style={{ backgroundColor: TEST_BG, color: TEST_FG, padding: '10px 28px', fontSize: 13, fontWeight: 600 }}>
                          MODO PRUEBA · Este email se habría enviado a: {originalRecipients?.join(', ') || '—'}
                        </td>
                      </tr>
                    )}

                    {/* Body */}
                    <tr>
                      <td style={{ padding: '28px' }}>{children}</td>
                    </tr>

                    {/* Footer */}
                    <tr>
                      <td style={{ padding: '20px 28px', borderTop: `1px solid ${BRAND_SOFT}`, color: MUTED, fontSize: 12, lineHeight: 1.6 }}>
                        <div style={{ color: FOREGROUND, fontWeight: 600, marginBottom: 4 }}>Diego Ferreyra Inmobiliaria</div>
                        <div>Sistema interno de gestión</div>
                        {recipientRole && (
                          <div style={{ marginTop: 10 }}>
                            Recibiste este email porque sos <strong>{recipientRole}</strong> en la plataforma.
                          </div>
                        )}
                        <div style={{ marginTop: 10 }}>
                          ¿Algo no cuadra? Respondé a este correo o escribí a <a href="mailto:contacto.julianparra@gmail.com" style={{ color: BRAND, textDecoration: 'underline' }}>contacto.julianparra@gmail.com</a>.
                        </div>
                        <div style={{ marginTop: 10, color: MUTED }}>
                          <a href="https://inmodf.com.ar" style={{ color: MUTED, textDecoration: 'none' }}>inmodf.com.ar</a>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

export const styles = {
  BRAND, BRAND_SOFT, FOREGROUND, MUTED, BACKGROUND,
}

// Shared small components (used by most templates)

export function Heading({ children }: { children: React.ReactNode }) {
  return <h1 style={{ margin: '0 0 16px 0', fontSize: 20, color: FOREGROUND, fontWeight: 700 }}>{children}</h1>
}

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 14px 0', fontSize: 15, lineHeight: 1.55, color: FOREGROUND }}>{children}</p>
}

export function DataBlock({ title, rows, variant }: { title?: string; rows: { label: string; value: React.ReactNode }[]; variant?: 'default' | 'success' | 'danger' }) {
  const borderColor = variant === 'success' ? '#15803D' : variant === 'danger' ? '#DC2626' : BRAND
  const bg = variant === 'success' ? '#F0FDF4' : variant === 'danger' ? '#FEF2F2' : BRAND_SOFT
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ margin: '4px 0 18px 0', backgroundColor: bg, borderLeft: `4px solid ${borderColor}`, borderRadius: 6 }}>
      <tbody>
        {title && (
          <tr><td colSpan={2} style={{ padding: '12px 16px 6px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: MUTED, fontWeight: 700 }}>{title}</td></tr>
        )}
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: '4px 16px', fontSize: 13, color: MUTED, verticalAlign: 'top', width: '38%' }}>{r.label}</td>
            <td style={{ padding: '4px 16px 4px 0', fontSize: 14, color: FOREGROUND, verticalAlign: 'top', fontWeight: 500 }}>{r.value}</td>
          </tr>
        ))}
        <tr><td colSpan={2} style={{ height: 10 }}></td></tr>
      </tbody>
    </table>
  )
}

export function Button({ href, children, variant }: { href: string; children: React.ReactNode; variant?: 'primary' | 'success' }) {
  const bg = variant === 'success' ? '#15803D' : BRAND
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} align="center" style={{ margin: '22px auto 6px auto' }}>
      <tbody>
        <tr>
          <td style={{ backgroundColor: bg, borderRadius: 8 }}>
            <a href={href} style={{ display: 'inline-block', padding: '12px 28px', color: '#FFFFFF', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>{children}</a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export function Divider() {
  return <div style={{ height: 1, backgroundColor: BRAND_SOFT, margin: '16px 0' }} />
}

export function Callout({ children, variant }: { children: React.ReactNode; variant?: 'info' | 'danger' | 'success' }) {
  const bg = variant === 'danger' ? '#FEF2F2' : variant === 'success' ? '#F0FDF4' : BRAND_SOFT
  const border = variant === 'danger' ? '#DC2626' : variant === 'success' ? '#15803D' : BRAND
  return (
    <div style={{ backgroundColor: bg, borderLeft: `4px solid ${border}`, padding: '12px 16px', borderRadius: 6, margin: '10px 0 18px 0', fontSize: 14, color: FOREGROUND, lineHeight: 1.5 }}>{children}</div>
  )
}

export function BASE_URL() {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar'
}

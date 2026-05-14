import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface LeadNotificationEmailProps {
  advisorFirstName: string
  propertyId: string
  propertyAddress: string
  propertyTitle: string | null
  neighborhood: string | null
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

const SOURCE_LABEL: Record<string, string> = {
  landing: 'Landing pública',
  meta_form: 'Meta Ads',
  portal_mercadolibre: 'MercadoLibre',
  portal_argenprop: 'Argenprop',
  portal_zonaprop: 'ZonaProp',
}

export function LeadNotificationEmail(props: LeadNotificationEmailProps) {
  const preheader = `${props.leadName} consultó por ${props.propertyAddress}.`
  const sourceLabel = SOURCE_LABEL[props.source] ?? props.source
  const utmEntries = Object.entries(props.utm).filter(([, v]) => v)

  return (
    <EmailLayout
      preheader={preheader}
      testMode={props.testMode}
      originalRecipients={props.originalRecipients}
      recipientRole="asesor"
    >
      <div
        style={{
          backgroundColor: '#EFF6FF',
          borderLeft: '4px solid #2563EB',
          borderRadius: 6,
          padding: '20px 22px',
          margin: '0 0 18px 0',
          textAlign: 'center' as const,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📩</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1E40AF', marginBottom: 4 }}>
          Nueva consulta
        </div>
        <div style={{ fontSize: 14, color: '#1E3A8A' }}>
          {props.propertyTitle ?? props.propertyAddress}
        </div>
      </div>

      <Paragraph>Hola {props.advisorFirstName},</Paragraph>
      <Paragraph>
        Tenés una nueva consulta sobre <strong>{props.propertyAddress}</strong>
        {props.neighborhood ? `, ${props.neighborhood}` : ''}. Llegó vía{' '}
        <strong>{sourceLabel}</strong>.
      </Paragraph>

      <DataBlock
        title="Datos del contacto"
        rows={[
          { label: 'Nombre', value: props.leadName },
          { label: 'Email', value: props.leadEmail || '—' },
          { label: 'Teléfono', value: props.leadPhone || '—' },
          { label: 'Recibida', value: props.createdAt },
        ]}
      />

      {props.leadMessage && (
        <>
          <Heading>Mensaje</Heading>
          <div
            style={{
              backgroundColor: '#F9FAFB',
              borderLeft: '3px solid #D1D5DB',
              padding: '12px 16px',
              margin: '8px 0 18px 0',
              fontSize: 14,
              color: '#374151',
              whiteSpace: 'pre-wrap' as const,
            }}
          >
            {props.leadMessage}
          </div>
        </>
      )}

      {utmEntries.length > 0 && (
        <DataBlock
          title="Origen de la campaña"
          rows={utmEntries.map(([k, v]) => ({ label: k, value: v }))}
        />
      )}

      <Paragraph>
        <strong>Próximo paso:</strong> contactá al cliente cuanto antes (los primeros 5 minutos
        triplican la tasa de conversión).
      </Paragraph>

      <Button href={`${BASE_URL()}/properties/${props.propertyId}`}>
        Ver propiedad
      </Button>
    </EmailLayout>
  )
}

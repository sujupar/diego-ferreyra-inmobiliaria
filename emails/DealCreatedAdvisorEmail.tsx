import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, Callout, BASE_URL } from './_components/EmailLayout'

export interface DealCreatedAdvisorEmailProps {
  advisorFirstName: string
  coordinadorName: string
  dealId: string
  propertyAddress: string
  neighborhood: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  propertyType: string | null
  origin: string | null
  contactName: string
  contactPhone: string | null
  contactEmail: string | null
  notes: string | null
  testMode?: boolean
  originalRecipients?: string[]
}

export function DealCreatedAdvisorEmail(props: DealCreatedAdvisorEmailProps) {
  const schedule = [props.scheduledDate, props.scheduledTime].filter(Boolean).join(' · ') || 'A coordinar'
  const preheader = `Coordinada por ${props.coordinadorName}. Contacto: ${props.contactName}${props.contactPhone ? ' (' + props.contactPhone + ')' : ''}.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="asesor">
      <Heading>Nueva tasación asignada</Heading>
      <Paragraph>Hola {props.advisorFirstName},</Paragraph>
      <Paragraph>
        <strong>{props.coordinadorName}</strong> coordinó una tasación nueva y te la asignó. Te pasamos los datos para que te organices.
      </Paragraph>
      <DataBlock title="Datos de la visita" rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Fecha y hora', value: schedule },
        { label: 'Tipo', value: props.propertyType || '—' },
        { label: 'Origen', value: props.origin || '—' },
        { label: 'Coordinó', value: props.coordinadorName },
      ]} />
      <DataBlock title="Contacto del propietario" rows={[
        { label: 'Nombre', value: props.contactName },
        { label: 'Teléfono', value: props.contactPhone ? <a href={`tel:${props.contactPhone}`} style={{ color: '#2A3B84' }}>{props.contactPhone}</a> : '—' },
        { label: 'Email', value: props.contactEmail ? <a href={`mailto:${props.contactEmail}`} style={{ color: '#2A3B84' }}>{props.contactEmail}</a> : '—' },
      ]} />
      {props.notes && (
        <Callout variant="info">
          <strong>Notas de {props.coordinadorName}:</strong><br />
          {props.notes}
        </Callout>
      )}
      <Button href={`${BASE_URL()}/pipeline/${props.dealId}`}>Ver el detalle en la plataforma</Button>
    </EmailLayout>
  )
}

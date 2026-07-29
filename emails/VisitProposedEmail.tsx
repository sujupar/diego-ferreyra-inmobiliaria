import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface VisitProposedEmailProps {
  clientName: string
  propertyId: string
  propertyAddress: string
  neighborhood: string | null
  clientPhone: string | null
  clientEmail: string | null
  scheduledAtLabel: string
  franjaLabel: string
  testMode?: boolean
  originalRecipients?: string[]
  recipientRole?: string
}

export function VisitProposedEmail(props: VisitProposedEmailProps) {
  const preheader = `${props.clientName} propuso visitar ${props.propertyAddress} el ${props.scheduledAtLabel}.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole={props.recipientRole}>
      <Heading>Nueva visita propuesta</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        <strong>{props.clientName}</strong> quiere visitar <strong>{props.propertyAddress}</strong>. Eligió día y franja desde el recorrido — hay que contactarlo para confirmar.
      </Paragraph>
      <DataBlock title="Datos de la visita propuesta" rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Día propuesto', value: props.scheduledAtLabel },
        { label: 'Franja', value: props.franjaLabel },
        { label: 'Cliente', value: props.clientName },
        { label: 'Teléfono', value: props.clientPhone || '—' },
        { label: 'Email', value: props.clientEmail || '—' },
      ]} />
      <Paragraph>
        La visita quedó <strong>a confirmar</strong>: contactá al cliente para cerrar el día y horario definitivos.
      </Paragraph>
      <Button href={`${BASE_URL()}/properties/${props.propertyId}`}>Ver propiedad</Button>
    </EmailLayout>
  )
}

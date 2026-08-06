import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Callout, Button, BASE_URL } from './_components/EmailLayout'

export interface AppraisalRequestAdminsEmailProps {
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  /** Ubicación que el interesado escribió en el formulario. null = no la dejó. */
  propertyLocation: string | null
  /** Mensaje libre del formulario, si dejó uno. */
  message: string | null
  requestedAt: string
  /** Campaña de Meta que trajo al lead (meta_campaign_name del deal). */
  campaignName: string | null
  dealId: string
  testMode?: boolean
  originalRecipients?: string[]
}

export function AppraisalRequestAdminsEmail(props: AppraisalRequestAdminsEmailProps) {
  const preheader = `${props.contactName} pidió una tasación desde la campaña. Falta contactarlo y coordinar la visita.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="administrador/dueño">
      <Heading>Nueva solicitud de tasación</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        <strong>{props.contactName}</strong> se registró desde la campaña pidiendo una tasación de su propiedad.
      </Paragraph>
      <Callout variant="info">
        Todavía <strong>no hay una tasación agendada</strong>: esto es una solicitud. Hay que contactar al interesado,
        asignarle un asesor y coordinar día y hora de la visita.
      </Callout>
      <DataBlock rows={[
        { label: 'Nombre', value: props.contactName },
        { label: 'Teléfono', value: props.contactPhone || '—' },
        { label: 'Email', value: props.contactEmail || '—' },
        { label: 'Ubicación indicada', value: props.propertyLocation || '— (no la dejó en el formulario)' },
        { label: 'Mensaje', value: props.message || '—' },
        { label: 'Fecha de la solicitud', value: props.requestedAt },
        { label: 'Campaña', value: props.campaignName || '—' },
      ]} />
      <Button href={`${BASE_URL()}/pipeline/${props.dealId}`}>Ver el deal y coordinar</Button>
    </EmailLayout>
  )
}

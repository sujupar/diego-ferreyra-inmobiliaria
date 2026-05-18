import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Callout, Button, BASE_URL } from './_components/EmailLayout'

export interface ClassRegistrationAdminsEmailProps {
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  registeredAt: string
  formName: string | null
  dealId: string
  testMode?: boolean
  originalRecipients?: string[]
}

export function ClassRegistrationAdminsEmail(props: ClassRegistrationAdminsEmailProps) {
  const preheader = `${props.contactName} se registró a la clase gratuita. No implica una solicitud de tasación.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="administrador/dueño">
      <Heading>Nuevo registro a clase gratuita</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        <strong>{props.contactName}</strong> se registró a la clase gratuita.
      </Paragraph>
      <Callout variant="info">
        Este registro <strong>no es una solicitud de tasación</strong>. El equipo debe contactar al lead para evaluar interés y, si corresponde, coordinar manualmente una tasación.
      </Callout>
      <DataBlock rows={[
        { label: 'Nombre', value: props.contactName },
        { label: 'Email', value: props.contactEmail || '—' },
        { label: 'Teléfono', value: props.contactPhone || '—' },
        { label: 'Fecha de registro', value: props.registeredAt },
        { label: 'Formulario', value: props.formName || '—' },
      ]} />
      <Button href={`${BASE_URL()}/pipeline/${props.dealId}`}>Ver en el pipeline</Button>
    </EmailLayout>
  )
}

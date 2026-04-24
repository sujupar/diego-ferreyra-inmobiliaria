import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface DocRejectedEmailProps {
  advisorFirstName: string
  lawyerName: string
  propertyId: string
  propertyAddress: string
  docLabel: string             // ej. "Escritura"
  reviewerNotes: string | null
  reviewedAt: string
  testMode?: boolean
  originalRecipients?: string[]
  recipientRole?: string
}

export function DocRejectedEmail(props: DocRejectedEmailProps) {
  const preheader = `${props.lawyerName} revisó la documentación. Hay un ítem a corregir en ${props.propertyAddress}.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole={props.recipientRole}>
      <Heading>Revisión legal — ajustes pedidos</Heading>
      <Paragraph>Hola {props.advisorFirstName},</Paragraph>
      <Paragraph>
        <strong>{props.lawyerName}</strong> revisó la documentación que subiste para <strong>{props.propertyAddress}</strong>. Hay un ajuste que te pide hacer antes de aprobar.
      </Paragraph>
      <DataBlock title="Qué hay que rehacer" variant="danger" rows={[
        { label: 'Documento', value: props.docLabel },
        { label: 'Motivo', value: props.reviewerNotes || 'Sin notas. Consultá con el abogado.' },
        { label: 'Revisado', value: props.reviewedAt },
      ]} />
      <Paragraph>
        <strong>Qué hacer ahora:</strong><br />
        1. Entrá al detalle de la propiedad desde el botón.<br />
        2. En el ítem marcado en rojo, tocá "Resubir".<br />
        3. Una vez actualizado, el abogado recibe el aviso y vuelve a revisar.
      </Paragraph>
      <Button href={`${BASE_URL()}/properties/${props.propertyId}`}>Resubir documentos</Button>
    </EmailLayout>
  )
}

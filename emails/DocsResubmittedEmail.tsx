import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, Callout, BASE_URL } from './_components/EmailLayout'

export interface DocsResubmittedEmailProps {
  lawyerFirstName: string | null
  advisorName: string
  propertyId: string
  propertyAddress: string
  docLabel: string
  updatedAt: string
  isFallbackToAllLawyers: boolean
  testMode?: boolean
  originalRecipients?: string[]
}

export function DocsResubmittedEmail(props: DocsResubmittedEmailProps) {
  const preheader = `${props.advisorName} actualizó el documento "${props.docLabel}" que habías marcado para corregir.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="abogado">
      <Heading>Documentación actualizada</Heading>
      <Paragraph>Hola{props.lawyerFirstName ? ` ${props.lawyerFirstName}` : ''},</Paragraph>
      <Paragraph>
        <strong>{props.advisorName}</strong> actualizó los documentos de <strong>{props.propertyAddress}</strong> que marcaste para corregir. La propiedad vuelve a estar pendiente de tu revisión.
      </Paragraph>
      {props.isFallbackToAllLawyers && (
        <Callout variant="info">
          Este email va a todo el equipo legal porque no pudimos identificar al revisor original.
        </Callout>
      )}
      <DataBlock title="Ítem actualizado" rows={[
        { label: 'Documento', value: props.docLabel },
        { label: 'Propiedad', value: props.propertyAddress },
        { label: 'Asesor', value: props.advisorName },
        { label: 'Actualizado el', value: props.updatedAt },
      ]} />
      <Button href={`${BASE_URL()}/properties/${props.propertyId}`}>Revisar documentación</Button>
    </EmailLayout>
  )
}

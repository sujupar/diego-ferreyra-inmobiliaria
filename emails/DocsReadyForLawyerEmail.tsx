import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, Callout, BASE_URL } from './_components/EmailLayout'

export interface DocsReadyForLawyerEmailProps {
  advisorName: string
  propertyId: string
  propertyAddress: string
  neighborhood: string | null
  propertyType: string | null
  uploadedAt: string
  docsList: string             // ej. "Autorización, DNI, Escritura"
  flagsSummary: string | null  // ej. "Sucesión · Poderes" o null si no hay flags
  testMode?: boolean
  originalRecipients?: string[]
}

export function DocsReadyForLawyerEmail(props: DocsReadyForLawyerEmailProps) {
  const preheader = `${props.advisorName} subió la documentación. ${props.flagsSummary ? 'Flags: ' + props.flagsSummary + '. ' : ''}Pendiente de revisión legal.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="abogado">
      <Heading>Documentos listos para revisar</Heading>
      <Paragraph>Hola,</Paragraph>
      <Paragraph>
        <strong>{props.advisorName}</strong> subió la documentación legal de una propiedad y está esperando revisión. Este email va a todos los abogados del equipo — quien tome el caso, que lo marque en la plataforma.
      </Paragraph>
      <DataBlock title="Propiedad" rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Tipo', value: props.propertyType || '—' },
        { label: 'Asesor', value: props.advisorName },
        { label: 'Subido el', value: props.uploadedAt },
      ]} />
      <DataBlock title="Documentos enviados" rows={[
        { label: 'Checklist', value: props.docsList || '—' },
      ]} />
      {props.flagsSummary && (
        <Callout variant="info">
          <strong>Flags legales activos:</strong> {props.flagsSummary}
        </Callout>
      )}
      <Button href={`${BASE_URL()}/properties/${props.propertyId}`}>Revisar documentos</Button>
    </EmailLayout>
  )
}

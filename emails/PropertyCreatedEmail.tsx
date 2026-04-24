import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface PropertyCreatedEmailProps {
  advisorName: string
  propertyId: string
  propertyAddress: string
  neighborhood: string | null
  propertyType: string | null
  askingPrice: string | null
  currency: string | null
  commissionPct: number | null
  testMode?: boolean
  originalRecipients?: string[]
  recipientRole?: string
}

export function PropertyCreatedEmail(props: PropertyCreatedEmailProps) {
  const preheader = `Precio pedido: ${props.askingPrice || '—'}. Próximo paso: ${props.advisorName} sube documentos para revisión legal.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole={props.recipientRole}>
      <Heading>Nueva propiedad cargada (pendiente de docs)</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        <strong>{props.advisorName}</strong> cargó la propiedad de {props.propertyAddress} después de que el propietario aceptara la tasación.
        La captación está en proceso: falta que se suban los documentos legales para que el abogado los revise.
      </Paragraph>
      <DataBlock title="Datos de la propiedad" rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Tipo', value: props.propertyType || '—' },
        { label: 'Precio pedido', value: [props.askingPrice, props.currency].filter(Boolean).join(' ') || '—' },
        { label: 'Comisión', value: props.commissionPct != null ? `${props.commissionPct}%` : '—' },
        { label: 'Cargó', value: props.advisorName },
      ]} />
      <Paragraph>
        <strong>Próximos pasos:</strong><br />
        1. {props.advisorName} sube los documentos legales.<br />
        2. El abogado los revisa. Si aprueba todo, la propiedad queda <strong>captada al 100%</strong>.<br />
        3. Las fotos pueden subirse en paralelo.
      </Paragraph>
      <Button href={`${BASE_URL()}/properties/${props.propertyId}`}>Ver propiedad</Button>
    </EmailLayout>
  )
}

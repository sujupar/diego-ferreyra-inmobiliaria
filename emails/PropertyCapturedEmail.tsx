import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface PropertyCapturedEmailProps {
  advisorName: string
  lawyerName: string | null
  propertyId: string
  propertyAddress: string
  neighborhood: string | null
  propertyType: string | null
  askingPrice: string | null
  currency: string | null
  commissionAmount: string | null
  daysFromDealToCapture: number | null
  capturedAt: string
  testMode?: boolean
  originalRecipients?: string[]
  recipientRole?: string
}

export function PropertyCapturedEmail(props: PropertyCapturedEmailProps) {
  const preheader = `Precio: ${props.askingPrice || '—'}. Asesor: ${props.advisorName}. Aprobada ${props.lawyerName ? 'por ' + props.lawyerName : ''} el ${props.capturedAt}.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole={props.recipientRole}>
      <Heading>Nueva captación al 100%</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        {props.lawyerName ? <>{props.lawyerName} aprobó toda la documentación.</> : <>Toda la documentación quedó aprobada.</>}
        {' '}<strong>{props.propertyAddress}</strong> quedó captada al 100%.
      </Paragraph>
      <DataBlock title="KPI de la captación" variant="success" rows={[
        { label: 'Precio pedido', value: [props.askingPrice, props.currency].filter(Boolean).join(' ') || '—' },
        { label: 'Comisión potencial', value: props.commissionAmount || '—' },
        { label: 'Asesor', value: props.advisorName },
        { label: 'Tiempo del proceso', value: props.daysFromDealToCapture != null ? `${props.daysFromDealToCapture} días` : '—' },
      ]} />
      <DataBlock rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Tipo', value: props.propertyType || '—' },
        { label: 'Captada el', value: props.capturedAt },
      ]} />
      <Button href={`${BASE_URL()}/properties/${props.propertyId}`} variant="success">Ver propiedad</Button>
    </EmailLayout>
  )
}

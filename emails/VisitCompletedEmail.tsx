import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface VisitCompletedEmailProps {
  advisorName: string
  dealId: string
  propertyAddress: string
  neighborhood: string | null
  propertyType: string | null
  rooms: number | null
  coveredArea: number | null
  saleReason: string | null
  askingPrice: string | null
  occupancyStatus: string | null
  visitCompletedAt: string
  testMode?: boolean
  originalRecipients?: string[]
  recipientRole?: string
}

export function VisitCompletedEmail(props: VisitCompletedEmailProps) {
  const preheader = `${props.advisorName} terminó la visita. ${props.propertyType || ''} ${props.coveredArea ? props.coveredArea + ' m²' : ''} · ${props.saleReason || ''}`.trim()
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole={props.recipientRole}>
      <Heading>Visita realizada</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        <strong>{props.advisorName}</strong> terminó la visita en {props.propertyAddress} y cargó los datos de la propiedad. Quedó lista para pasar a tasación.
      </Paragraph>
      <DataBlock title="Datos de la visita" rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Tipo', value: props.propertyType || '—' },
        { label: 'Ambientes', value: props.rooms != null ? String(props.rooms) : '—' },
        { label: 'Sup. cubierta', value: props.coveredArea != null ? `${props.coveredArea} m²` : '—' },
        { label: 'Visitó', value: props.advisorName },
        { label: 'Fecha visita', value: props.visitCompletedAt },
      ]} />
      {(props.saleReason || props.askingPrice || props.occupancyStatus) && (
        <DataBlock title="Highlights del propietario" rows={[
          ...(props.saleReason ? [{ label: 'Motivo de venta', value: props.saleReason }] : []),
          ...(props.askingPrice ? [{ label: 'Precio pretendido', value: props.askingPrice }] : []),
          ...(props.occupancyStatus ? [{ label: 'Estado', value: props.occupancyStatus }] : []),
        ]} />
      )}
      <Button href={`${BASE_URL()}/pipeline/${props.dealId}`}>Ver detalle del deal</Button>
    </EmailLayout>
  )
}

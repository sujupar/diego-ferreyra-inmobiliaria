import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'
import { copyCaptacion } from '@/lib/email/captacion-copy'

export interface PropertyCapturedEmailProps {
  advisorName: string
  lawyerName: string | null
  /**
   * `legal_status === 'approved'` al momento de captar. Sin esto el mail decía
   * "Toda la documentación quedó aprobada" para propiedades captadas solo con
   * fotos — afirmaba algo falso. Ver lib/email/captacion-copy.ts.
   */
  documentacionAprobada: boolean
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
  const copy = copyCaptacion({
    documentacionAprobada: props.documentacionAprobada,
    nombreAbogado: props.lawyerName,
    direccion: props.propertyAddress,
  })
  const preheader = `Precio: ${props.askingPrice || '—'}. Asesor: ${props.advisorName}. Captada el ${props.capturedAt}.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole={props.recipientRole}>
      <Heading>{copy.titulo}</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        <strong>{props.propertyAddress}</strong> quedó captada. {copy.fraseEstado}
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
        { label: 'Documentación legal', value: props.documentacionAprobada ? 'Aprobada' : 'Pendiente (no bloquea la captación)' },
        { label: 'Captada el', value: props.capturedAt },
      ]} />
      <Button href={`${BASE_URL()}/properties/${props.propertyId}`} variant="success">Ver propiedad</Button>
    </EmailLayout>
  )
}

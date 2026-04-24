import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface CongratulationsAsesorEmailProps {
  advisorFirstName: string
  lawyerName: string | null
  propertyId: string
  propertyAddress: string
  neighborhood: string | null
  propertyType: string | null
  askingPrice: string | null
  currency: string | null
  commissionPct: number | null
  capturedAt: string
  testMode?: boolean
  originalRecipients?: string[]
}

export function CongratulationsAsesorEmail(props: CongratulationsAsesorEmailProps) {
  const preheader = `El abogado aprobó todos los documentos. Precio pedido: ${props.askingPrice || '—'}. Ya podés publicarla.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="asesor">
      {/* Hero verde */}
      <div style={{ backgroundColor: '#F0FDF4', borderLeft: '4px solid #15803D', borderRadius: 6, padding: '20px 22px', margin: '0 0 18px 0', textAlign: 'center' as const }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#15803D', marginBottom: 4 }}>Nueva captación confirmada</div>
        <div style={{ fontSize: 14, color: '#166534' }}>{props.propertyAddress}{props.neighborhood ? `, ${props.neighborhood}` : ''}</div>
      </div>

      <Paragraph>Hola {props.advisorFirstName},</Paragraph>
      <Paragraph>
        <strong>¡Lograste una nueva captación!</strong>
        {' '}{props.lawyerName ? `${props.lawyerName} aprobó` : 'Se aprobó'} toda la documentación legal. La propiedad está captada al 100% y lista para publicar.
      </Paragraph>

      <DataBlock title="Resumen de tu captación" rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Tipo', value: props.propertyType || '—' },
        { label: 'Precio pedido', value: [props.askingPrice, props.currency].filter(Boolean).join(' ') || '—' },
        { label: 'Comisión', value: props.commissionPct != null ? `${props.commissionPct}%` : '—' },
        { label: 'Captada el', value: props.capturedAt },
      ]} />

      <Paragraph>
        <strong>Próximos pasos:</strong><br />
        1. Publicá la propiedad en los portales desde la plataforma.<br />
        2. Activá el seguimiento comercial con el propietario.
      </Paragraph>

      <Button href={`${BASE_URL()}/properties/${props.propertyId}`} variant="success">Ver mi captación</Button>
    </EmailLayout>
  )
}

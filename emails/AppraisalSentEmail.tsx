import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL, styles } from './_components/EmailLayout'

export interface AppraisalSentEmailProps {
  advisorName: string
  dealId: string
  appraisalId: string
  propertyAddress: string
  neighborhood: string | null
  valor: string                // ej. "USD 185.000"
  valorMin?: string | null
  valorMax?: string | null
  fecha: string
  pdfFilename: string
  testMode?: boolean
  originalRecipients?: string[]
  recipientRole?: string
}

export function AppraisalSentEmail(props: AppraisalSentEmailProps) {
  const preheader = `Valor sugerido: ${props.valor}. Tasó ${props.advisorName} el ${props.fecha}. PDF adjunto.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole={props.recipientRole}>
      <Heading>Tasación entregada</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        <strong>{props.advisorName}</strong> terminó y entregó la tasación de {props.propertyAddress}. Adjuntamos el informe en PDF.
      </Paragraph>

      {/* Valor destacado */}
      <div style={{ backgroundColor: styles.BRAND_SOFT, borderLeft: `4px solid ${styles.BRAND}`, borderRadius: 6, padding: '16px 18px', margin: '4px 0 18px 0' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: styles.MUTED, fontWeight: 700 }}>Valor sugerido</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: styles.BRAND, marginTop: 4 }}>{props.valor}</div>
        {(props.valorMin || props.valorMax) && (
          <div style={{ fontSize: 13, color: styles.MUTED, marginTop: 4 }}>
            Rango estimado: {props.valorMin || '—'} a {props.valorMax || '—'}
          </div>
        )}
      </div>

      <DataBlock rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Tasó', value: props.advisorName },
        { label: 'Fecha de entrega', value: props.fecha },
        { label: 'Adjunto', value: `${props.pdfFilename}` },
      ]} />

      <Button href={`${BASE_URL()}/appraisals/${props.appraisalId}`}>Ver tasación en la plataforma</Button>
      <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13 }}>
        <a href={`${BASE_URL()}/pipeline/${props.dealId}`} style={{ color: styles.MUTED, textDecoration: 'underline' }}>Ir al deal del propietario</a>
      </div>
    </EmailLayout>
  )
}

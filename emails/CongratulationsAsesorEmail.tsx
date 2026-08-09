import 'server-only'
import * as React from 'react'
import { EmailLayout, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'
import { copyCaptacion } from '@/lib/email/captacion-copy'

export interface CongratulationsAsesorEmailProps {
  advisorFirstName: string
  lawyerName: string | null
  /**
   * `legal_status === 'approved'` al momento de captar.
   *
   * Desde 2026-08-09 una propiedad se capta con fotos y sin documentación
   * revisada. Sin este dato el mail afirmaba "Se aprobó toda la documentación
   * legal" para propiedades donde el abogado no había mirado nada.
   */
  documentacionAprobada: boolean
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
  const copy = copyCaptacion({
    documentacionAprobada: props.documentacionAprobada,
    nombreAbogado: props.lawyerName,
    direccion: props.propertyAddress,
  })
  const preheader = `Precio pedido: ${props.askingPrice || '—'}. ${copy.cierreAsesor}`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="asesor">
      {/* Hero verde */}
      <div style={{ backgroundColor: '#F0FDF4', borderLeft: '4px solid #15803D', borderRadius: 6, padding: '20px 22px', margin: '0 0 18px 0', textAlign: 'center' as const }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#15803D', marginBottom: 4 }}>{copy.titulo}</div>
        <div style={{ fontSize: 14, color: '#166534' }}>{props.propertyAddress}{props.neighborhood ? `, ${props.neighborhood}` : ''}</div>
      </div>

      <Paragraph>Hola {props.advisorFirstName},</Paragraph>
      <Paragraph>
        <strong>¡Lograste una nueva captación!</strong>
        {' '}{copy.fraseEstado}
      </Paragraph>

      <DataBlock title="Resumen de tu captación" rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Tipo', value: props.propertyType || '—' },
        { label: 'Precio pedido', value: [props.askingPrice, props.currency].filter(Boolean).join(' ') || '—' },
        { label: 'Comisión', value: props.commissionPct != null ? `${props.commissionPct}%` : '—' },
        { label: 'Documentación legal', value: props.documentacionAprobada ? 'Aprobada' : 'Pendiente (no bloquea la captación)' },
        { label: 'Captada el', value: props.capturedAt },
      ]} />

      <Paragraph>
        <strong>Próximos pasos:</strong><br />
        {copy.proximosPasos.map((paso, i) => (
          <React.Fragment key={paso}>{i + 1}. {paso}<br /></React.Fragment>
        ))}
      </Paragraph>

      <Button href={`${BASE_URL()}/properties/${props.propertyId}`} variant="success">Ver mi captación</Button>
    </EmailLayout>
  )
}

import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface DealCreatedAdminsEmailProps {
  coordinadorName: string
  advisorName: string | null
  dealId: string
  propertyAddress: string
  neighborhood: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  propertyType: string | null
  origin: string | null
  testMode?: boolean
  originalRecipients?: string[]
}

export function DealCreatedAdminsEmail(props: DealCreatedAdminsEmailProps) {
  const schedule = [props.scheduledDate, props.scheduledTime].filter(Boolean).join(' · ') || 'A coordinar'
  const preheader = `${props.coordinadorName} agendó una tasación para el ${props.scheduledDate || 'día a coordinar'}. Asignada a ${props.advisorName || 'asesor por definir'}.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients} recipientRole="administrador/dueño">
      <Heading>Tasación agendada</Heading>
      <Paragraph>Hola equipo,</Paragraph>
      <Paragraph>
        {props.coordinadorName} agendó una tasación nueva{props.advisorName ? ` y la asignó a ${props.advisorName}` : ''}.
      </Paragraph>
      <DataBlock rows={[
        { label: 'Dirección', value: props.propertyAddress },
        { label: 'Barrio', value: props.neighborhood || '—' },
        { label: 'Fecha y hora', value: schedule },
        { label: 'Tipo', value: props.propertyType || '—' },
        { label: 'Asesor', value: props.advisorName || 'Sin asignar' },
        { label: 'Origen', value: props.origin || '—' },
      ]} />
      <Button href={`${BASE_URL()}/pipeline/${props.dealId}`}>Ver el deal</Button>
    </EmailLayout>
  )
}

import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, Button, Callout } from './_components/EmailLayout'

export interface InvitationEmailProps {
  inviteeEmail: string
  roleLabel: string            // ej. "Coordinador", "Asesor"
  inviterName: string
  acceptUrl: string
  expiresInDays: number
  testMode?: boolean
  originalRecipients?: string[]
}

export function InvitationEmail(props: InvitationEmailProps) {
  const preheader = `${props.inviterName} te invitó a sumarte como ${props.roleLabel}. El link expira en ${props.expiresInDays} días.`
  return (
    <EmailLayout preheader={preheader} testMode={props.testMode} originalRecipients={props.originalRecipients}>
      <Heading>Te invitaron a Diego Ferreyra Inmobiliaria</Heading>
      <Paragraph>
        <strong>{props.inviterName}</strong> te invitó a sumarte al sistema de gestión interno como <strong>{props.roleLabel}</strong>.
      </Paragraph>
      <Paragraph>
        Hacé click en el botón para crear tu cuenta y aceptar la invitación. El link es personal y expira en {props.expiresInDays} días.
      </Paragraph>
      <Button href={props.acceptUrl}>Aceptar invitación</Button>
      <Callout variant="info">
        Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br />
        <a href={props.acceptUrl} style={{ wordBreak: 'break-all', color: '#2A3B84' }}>{props.acceptUrl}</a>
      </Callout>
    </EmailLayout>
  )
}

import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, DataBlock, Button, BASE_URL } from './_components/EmailLayout'

export interface AdminFailureAlertEmailProps {
  failedNotificationType: string
  entityType: string
  entityId: string
  errors: string[]
  detailUrl?: string
  testMode?: boolean
  originalRecipients?: string[]
}

export function AdminFailureAlertEmail(props: AdminFailureAlertEmailProps) {
  return (
    <EmailLayout
      preheader={`Falló el envío de ${props.failedNotificationType} (entity ${props.entityId}).`}
      recipientRole="administrador"
      testMode={props.testMode}
      originalRecipients={props.originalRecipients}
    >
      <Heading>Falló una notificación crítica</Heading>
      <Paragraph>
        El sistema intentó enviar una notificación y algunos destinatarios fallaron. Revisalo desde el historial para reenviar manualmente.
      </Paragraph>
      <DataBlock title="Detalle del fallo" variant="danger" rows={[
        { label: 'Tipo', value: props.failedNotificationType },
        { label: 'Entidad', value: `${props.entityType}:${props.entityId}` },
        { label: 'Errores', value: props.errors.slice(0, 5).join(' · ') },
      ]} />
      <Button href={props.detailUrl || `${BASE_URL()}/settings/notifications`}>Ver historial de notificaciones</Button>
    </EmailLayout>
  )
}

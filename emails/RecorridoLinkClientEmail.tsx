import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, Button } from './_components/EmailLayout'

export interface RecorridoLinkClientEmailProps {
  clientName: string
  propertyLabel: string
  accessUrl: string
  testMode?: boolean
  originalRecipients?: string[]
}

/**
 * Email AL CLIENTE que se acaba de registrar en la landing: le entrega el link
 * de su recorrido. Es la única entrega garantizada del link mientras WhatsApp
 * esté apagado (la pantalla de gracias se pierde si cierra el popup).
 *
 * Sin `recipientRole`: quien lo recibe no es del equipo, es el interesado.
 */
export function RecorridoLinkClientEmail(props: RecorridoLinkClientEmailProps) {
  const firstName = props.clientName.trim().split(/\s+/)[0] || props.clientName
  const preheader = `Acá tenés el recorrido de ${props.propertyLabel} para conocerla por dentro.`
  return (
    <EmailLayout
      preheader={preheader}
      testMode={props.testMode}
      originalRecipients={props.originalRecipients}
    >
      <Heading>Tu recorrido por {props.propertyLabel}</Heading>
      <Paragraph>Hola {firstName}, gracias por registrarte.</Paragraph>
      <Paragraph>
        Acá tenés el <strong>recorrido de {props.propertyLabel}</strong> para conocerla por
        dentro, con calma y desde donde estés.
      </Paragraph>
      <Paragraph>
        Y si te gusta lo que ves, desde ahí mismo podés <strong>proponer el día y el
        horario</strong> que te queden cómodos para visitarla. Nosotros te contactamos para
        confirmarla.
      </Paragraph>
      <Button href={props.accessUrl}>Ver el recorrido</Button>
      <Paragraph>
        Si el botón no te funciona, copiá y pegá este enlace en tu navegador:{' '}
        <a href={props.accessUrl}>{props.accessUrl}</a>
      </Paragraph>
    </EmailLayout>
  )
}

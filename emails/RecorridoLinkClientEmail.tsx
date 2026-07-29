import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, Button } from './_components/EmailLayout'

export interface RecorridoLinkClientEmailProps {
  clientName: string
  propertyLabel: string
  accessUrl: string
  /**
   * `false` cuando la propiedad se quedó sin video recorrido ni recorrido virtual
   * (el asesor lo borró después de publicar). El link sirve igual —lleva a las
   * fotos completas y a la agenda— pero NO prometemos un recorrido que no existe.
   */
  hasRecorrido?: boolean
  testMode?: boolean
  originalRecipients?: string[]
}

/**
 * Email AL CLIENTE que se acaba de registrar en la landing: le entrega el link
 * de su recorrido. Es la entrega que queda (la pantalla de gracias se pierde si
 * cierra el popup, y el WhatsApp depende de que haya teléfono y plantilla).
 *
 * Sin `recipientRole`: quien lo recibe no es del equipo, es el interesado.
 */
export function RecorridoLinkClientEmail(props: RecorridoLinkClientEmailProps) {
  const firstName = props.clientName.trim().split(/\s+/)[0] || props.clientName
  const conRecorrido = props.hasRecorrido !== false
  const preheader = conRecorrido
    ? `Acá tenés el recorrido de ${props.propertyLabel} para conocerla por dentro.`
    : `Acá tenés las fotos completas de ${props.propertyLabel} y podés proponer una visita.`
  return (
    <EmailLayout
      preheader={preheader}
      testMode={props.testMode}
      originalRecipients={props.originalRecipients}
    >
      <Heading>
        {conRecorrido ? `Tu recorrido por ${props.propertyLabel}` : `${props.propertyLabel}, en detalle`}
      </Heading>
      <Paragraph>Hola {firstName}, gracias por registrarte.</Paragraph>
      <Paragraph>
        {conRecorrido ? (
          <>
            Acá tenés el <strong>recorrido de {props.propertyLabel}</strong> para conocerla por
            dentro, con calma y desde donde estés.
          </>
        ) : (
          <>
            Acá tenés las <strong>fotos completas de {props.propertyLabel}</strong> para verla con
            calma y desde donde estés.
          </>
        )}
      </Paragraph>
      <Paragraph>
        Y si te gusta lo que ves, desde ahí mismo podés <strong>proponer el día y el
        horario</strong> que te queden cómodos para visitarla. Nosotros te contactamos para
        confirmarla.
      </Paragraph>
      <Button href={props.accessUrl}>{conRecorrido ? 'Ver el recorrido' : 'Ver la propiedad'}</Button>
      <Paragraph>
        Si el botón no te funciona, copiá y pegá este enlace en tu navegador:{' '}
        <a href={props.accessUrl}>{props.accessUrl}</a>
      </Paragraph>
    </EmailLayout>
  )
}

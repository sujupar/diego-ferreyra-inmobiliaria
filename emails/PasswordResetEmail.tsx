import 'server-only'
import * as React from 'react'
import { EmailLayout, Heading, Paragraph, Button, Callout } from './_components/EmailLayout'

export interface PasswordResetEmailProps {
  /** Nombre de la persona, si se conoce. Sin nombre el saludo queda genérico. */
  nombre: string | null
  enlace: string
  venceEnMinutos: number
}

export function PasswordResetEmail(props: PasswordResetEmailProps) {
  const saludo = props.nombre ? `Hola, ${props.nombre}:` : 'Hola:'
  return (
    <EmailLayout preheader={`Elegí una contraseña nueva. El enlace vence en ${props.venceEnMinutos} minutos.`}>
      <Heading>Restablecé tu contraseña</Heading>
      <Paragraph>{saludo}</Paragraph>
      <Paragraph>
        Recibimos un pedido para cambiar la contraseña de tu cuenta en la plataforma de Diego Ferreyra
        Inmobiliaria. Tocá el botón para elegir una nueva. Al guardarla, entrás directo.
      </Paragraph>
      <Button href={props.enlace}>Elegir contraseña nueva</Button>
      <Paragraph>
        El enlace sirve una sola vez y vence en {props.venceEnMinutos} minutos.
      </Paragraph>
      <Callout variant="info">
        Si no pediste este cambio, ignorá este email: tu contraseña actual sigue funcionando.
        <br />
        <br />
        Si el botón no funciona, copiá y pegá este enlace en tu navegador:
        <br />
        <a href={props.enlace} style={{ wordBreak: 'break-all', color: '#2A3B84' }}>{props.enlace}</a>
      </Callout>
    </EmailLayout>
  )
}

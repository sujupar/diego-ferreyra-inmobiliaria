import { Role } from '@/types/auth.types'
import { ROLE_LABELS } from './roles'

const BRAND_COLOR = '#1a1a2e'
const ACCENT_COLOR = '#e94560'
const LOGO_URL = 'https://storage.googleapis.com/msgsndr/Zd3mW81lbIpC8mi06Cgf/media/682c6cc8e10a088724d26be6.png'

function baseLayout(content: string): string {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td align="center" style="padding-bottom: 32px;">
        <img src="${LOGO_URL}" alt="Diego Ferreyra Inmobiliaria" height="48" style="height: 48px; width: auto;" />
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 32px;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top: 24px;">
        <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
          Diego Ferreyra Inmobiliaria - Plataforma de Gestion
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function invitationEmailHtml(params: {
    inviteeName?: string
    role: Role
    inviterName: string
    acceptUrl: string
}): string {
    const { role, inviterName, acceptUrl } = params
    const roleLabel = ROLE_LABELS[role]

    const content = `
    <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: ${BRAND_COLOR};">
      Has sido invitado
    </h1>
    <p style="margin: 0 0 24px; font-size: 16px; color: #52525b; line-height: 1.6;">
      <strong>${inviterName}</strong> te ha invitado a unirte a la plataforma de
      Diego Ferreyra Inmobiliaria como <strong>${roleLabel}</strong>.
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center" style="background: ${ACCENT_COLOR}; border-radius: 8px;">
          <a href="${acceptUrl}" target="_blank"
             style="display: inline-block; padding: 14px 32px; color: white; text-decoration: none; font-size: 16px; font-weight: 600;">
            Aceptar invitacion
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px; font-size: 13px; color: #a1a1aa;">
      Este enlace expira en 7 dias. Si no solicitaste esta invitacion, puedes ignorar este correo.
    </p>
    <p style="margin: 0; font-size: 13px; color: #a1a1aa;">
      Si el boton no funciona, copia y pega este enlace en tu navegador:
    </p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #71717a; word-break: break-all;">
      ${acceptUrl}
    </p>`

    return baseLayout(content)
}

export function welcomeEmailHtml(params: {
    fullName: string
    role: Role
    loginUrl: string
}): string {
    const { fullName, role, loginUrl } = params
    const roleLabel = ROLE_LABELS[role]

    const content = `
    <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: ${BRAND_COLOR};">
      Bienvenido, ${fullName}
    </h1>
    <p style="margin: 0 0 24px; font-size: 16px; color: #52525b; line-height: 1.6;">
      Tu cuenta ha sido creada exitosamente. Tu rol en la plataforma es
      <strong>${roleLabel}</strong>.
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center" style="background: ${ACCENT_COLOR}; border-radius: 8px;">
          <a href="${loginUrl}" target="_blank"
             style="display: inline-block; padding: 14px 32px; color: white; text-decoration: none; font-size: 16px; font-weight: 600;">
            Ir a la plataforma
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; color: #a1a1aa;">
      Si tienes alguna duda, contacta al administrador de la plataforma.
    </p>`

    return baseLayout(content)
}

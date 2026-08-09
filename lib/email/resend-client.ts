import 'server-only'
import { Resend, type CreateEmailRequestOptions } from 'resend'
import { applyTestMode } from './test-mode'
import { logNotification, alreadySentToRecipient } from './log'

let client: Resend | null = null
function getClient(): Resend | null {
  if (client) return client
  if (!process.env.RESEND_API_KEY) return null
  client = new Resend(process.env.RESEND_API_KEY)
  return client
}

const DEFAULT_FROM = process.env.EMAIL_FROM_DEFAULT
  ?? 'Diego Ferreyra Inmobiliaria <notificaciones@inmodf.com.ar>'
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO
  ?? 'contacto.julianparra@gmail.com'

/**
 * Techo de tiempo por envío individual (un destinatario = una llamada a Resend).
 *
 * POR QUÉ 8 s, con los números medidos el 2026-08-08 sobre 210 envíos reales:
 * la latencia de Resend tiene p95 = 0,77 s y el envío completo del embudo
 * (que incluye el trabajo de base) tiene mediana 3,35 s y p90 3,94 s. Ocho
 * segundos son ~10× el p95 de Resend: ninguna llamada legítima observada se
 * le acerca. La ÚNICA muestra por encima fue el cuelgue de 34,47 s que devolvió
 * un 504 al dueño sobre tráfico pago.
 *
 * El techo también tiene que caber en el presupuesto de la función de Netlify
 * (~26 s, ver la regla dura de CLAUDE.md sobre encadenar llamadas). El camino
 * del embudo manda a 2 destinatarios: 2 × 8 s = 16 s de peor caso, más el resto
 * del trabajo, sigue adentro. Un techo de 15 s ya no cerraría.
 *
 * Es el mismo valor que `lib/integrations/mailchimp/client.ts` — un número menos
 * que justificar por separado.
 */
export const TECHO_ENVIO_MS = 8_000

/**
 * Techo para envíos CON adjunto. Hoy el único es la tasación en PDF
 * (`notifications/appraisal-sent.ts`): el archivo viaja en base64 dentro del
 * cuerpo del POST, así que el tiempo lo domina la SUBIDA y no la latencia de la
 * API — medir ese caso contra el p95 de un envío sin adjunto sería comparar
 * cosas distintas. Además no está en el camino del tráfico pago: lo dispara el
 * equipo desde el CRM, no un formulario público.
 */
export const TECHO_ENVIO_CON_ADJUNTOS_MS = 20_000

/**
 * Prefijo estable del mensaje de error por vencimiento. Vive en una constante
 * para que se pueda buscar en `email_notifications_log.error_message` dentro de
 * seis meses sin adivinar cómo estaba redactado.
 */
export const PREFIJO_ERROR_TIEMPO = 'Tiempo de espera agotado'

export interface SendEmailInput {
  notificationType: string
  entityType?: 'deal' | 'property' | 'appraisal' | 'user'
  entityId?: string
  to: string | string[]
  from?: string
  replyTo?: string
  subject: string
  html: string
  attachments?: { filename: string; content: Buffer }[]
  /**
   * When true (default) skips destinatarios that already received this
   * (notificationType, entityId) pair. Set false for repeatable events
   * (doc rechazado, resubmitted, etc.).
   */
  idempotent?: boolean
  /**
   * Techo de tiempo en ms para CADA envío individual. Si no se pasa, se deriva
   * de si el mensaje lleva adjuntos (ver `techoParaEnvio`). Mismo patrón que
   * `timeoutMs` en el cliente de Mailchimp.
   */
  timeoutMs?: number
}

/** Techo efectivo: lo que pidió el llamador, o el default según haya adjuntos. */
export function techoParaEnvio(
  input: Pick<SendEmailInput, 'timeoutMs' | 'attachments'>,
): number {
  const pedido = input.timeoutMs
  // Un 0, un negativo o un NaN no son "sin techo": son un error del llamador.
  // Caer al default es más seguro que quedarse esperando para siempre.
  if (typeof pedido === 'number' && Number.isFinite(pedido) && pedido > 0) return pedido
  return input.attachments?.length ? TECHO_ENVIO_CON_ADJUNTOS_MS : TECHO_ENVIO_MS
}

/** Falla por vencimiento del techo. Se trata como cualquier otro fallo de envío. */
export class ErrorTiempoEnvio extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`${PREFIJO_ERROR_TIEMPO}: Resend no respondió en ${timeoutMs} ms`)
    this.name = 'ErrorTiempoEnvio'
  }
}

/**
 * El SDK de Resend 6.9.4 NO tipa `signal`, pero SÍ lo reenvía: `Resend.post()`
 * arma `{ method, body, ...options, headers }` y le pasa ese objeto tal cual a
 * `fetch()`. Verificado empíricamente contra un servidor local que acepta la
 * conexión y nunca responde: con `signal` la promesa se resuelve en ~610 ms y
 * el socket del lado servidor se CIERRA. O sea: cancelamos de verdad, no nos
 * limitamos a dejar de esperar.
 */
type OpcionesEnvioConSenal = CreateEmailRequestOptions & { signal?: AbortSignal }

type ClienteEmails = Pick<Resend['emails'], 'send'>
type PayloadEnvio = Parameters<Resend['emails']['send']>[0]

/**
 * Envía con techo de tiempo. Corta la petición de verdad (AbortController) y,
 * como red de seguridad, corre una carrera contra un temporizador: si una
 * versión futura del SDK dejara de reenviar `signal`, seguiríamos sin colgarnos
 * (aunque en ese caso la petición quedaría viva del lado de Resend).
 */
export async function enviarConTecho(
  emails: ClienteEmails,
  payload: PayloadEnvio,
  timeoutMs: number,
): Promise<{ id?: string }> {
  const controlador = new AbortController()
  let temporizador: ReturnType<typeof setTimeout> | undefined

  const vencimiento = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => {
      controlador.abort()
      rechazar(new ErrorTiempoEnvio(timeoutMs))
    }, timeoutMs)
  })

  try {
    const { data, error } = await Promise.race([
      emails.send(payload, { signal: controlador.signal } as OpcionesEnvioConSenal),
      vencimiento,
    ])
    // Empate: si el aborto llegó justo antes de que la promesa del SDK ganara la
    // carrera, el SDK se TRAGA el AbortError en su propio catch y devuelve un
    // error genérico ("Unable to fetch data. The request could not be resolved.")
    // que no menciona el tiempo por ningún lado. Sin este chequeo, un cuelgue
    // quedaría registrado como un fallo de red cualquiera.
    if (controlador.signal.aborted) throw new ErrorTiempoEnvio(timeoutMs)
    if (error) throw new Error(error.message)
    return { id: data?.id }
  } finally {
    clearTimeout(temporizador)
  }
}

export interface SendEmailResult {
  ok: boolean
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

/**
 * Central email sender. Applies test-mode redirection, per-recipient
 * idempotency, and structured logging. Never throws — errors are logged
 * and returned in the result so callers can stay fire-and-forget.
 *
 * Cada envío individual lleva techo de tiempo (`techoParaEnvio`). Un
 * vencimiento NO es una excepción nueva: recorre el MISMO camino que cualquier
 * otro fallo (log con `status:'failed'`, `result.failed++`, `result.ok=false`)
 * y la función sigue sin lanzar. Lo único distinto es el `error_message`, que
 * arranca con `PREFIJO_ERROR_TIEMPO` para que se pueda distinguir.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const result: SendEmailResult = { ok: true, sent: 0, skipped: 0, failed: 0, errors: [] }
  const resend = getClient()
  const idempotent = input.idempotent !== false

  // Ruidoso en vez de silencioso: si la API key no está seteada (ej. durante
  // propagación DNS los primeros días), logueamos y devolvemos ok=false en
  // lugar de lanzar. El caller puede decidir si escalar.
  if (!resend) {
    const msg = 'RESEND_API_KEY not set; skipping email send'
    console.error(`[resend] ${msg} — type=${input.notificationType} entity=${input.entityId ?? '-'}`)
    result.ok = false
    result.errors.push(msg)
    return result
  }

  const { to, subject, testModeOn, originalTo } = await applyTestMode(input.to, input.subject)

  for (const recipient of to) {
    // Idempotency check per recipient.
    if (idempotent && input.entityId) {
      try {
        if (await alreadySentToRecipient(input.notificationType, input.entityId, recipient)) {
          await logNotification({
            notificationType: input.notificationType,
            entityType: input.entityType,
            entityId: input.entityId,
            recipient,
            originalRecipient: originalTo.join(','),
            subject,
            status: 'skipped_idempotent',
            testMode: testModeOn,
          })
          result.skipped++
          continue
        }
      } catch (err) {
        console.error('[resend] idempotency check failed, proceeding with send:', err)
      }
    }

    try {
      // OJO con la idempotencia ante un vencimiento: abortamos el socket, pero
      // Resend pudo haber aceptado y encolado el mensaje antes del corte. Ese
      // envío queda logueado como 'failed', así que `alreadySentToRecipient`
      // (que solo mira filas 'sent') NO lo frenaría y un reintento podría
      // duplicar el email. Es la ambigüedad clásica de todo timeout, no algo
      // que introduzca este techo — antes el mismo cuelgue terminaba igual en
      // 'failed', solo que 36 s más tarde. Si algún día molesta, la solución es
      // el `idempotencyKey` del propio SDK (header `Idempotency-Key`), OJO: no
      // se puede usar una clave determinística en los flujos con
      // `idempotent: false` (doc rechazado, docs reenviados), que a propósito
      // repiten el mismo (tipo, entidad, destinatario) y quedarían silenciados.
      const { id } = await enviarConTecho(
        resend.emails,
        {
          from: input.from ?? DEFAULT_FROM,
          to: recipient,
          replyTo: input.replyTo ?? DEFAULT_REPLY_TO,
          subject,
          html: input.html,
          attachments: input.attachments,
        },
        techoParaEnvio(input),
      )
      await logNotification({
        notificationType: input.notificationType,
        entityType: input.entityType,
        entityId: input.entityId,
        recipient,
        originalRecipient: originalTo.join(','),
        subject,
        status: 'sent',
        testMode: testModeOn,
        resendId: id,
      })
      result.sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[resend] send failed to ${recipient}: ${msg}`)
      await logNotification({
        notificationType: input.notificationType,
        entityType: input.entityType,
        entityId: input.entityId,
        recipient,
        originalRecipient: originalTo.join(','),
        subject,
        status: 'failed',
        testMode: testModeOn,
        errorMessage: msg,
      })
      result.failed++
      result.errors.push(msg)
      result.ok = false
    }
  }

  return result
}

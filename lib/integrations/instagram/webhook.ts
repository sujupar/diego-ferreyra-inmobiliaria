/**
 * Lo que manda Meta cuando alguien comenta o toca el botón.
 *
 * ## La firma NO es un detalle
 *
 * Esta ruta es pública: tiene que serlo, porque Meta no tiene sesión del CRM. Lo
 * único que separa un aviso legítimo de uno inventado es la firma
 * `x-hub-signature-256`, calculada con el secreto de la app. Sin verificarla,
 * cualquiera que descubra la dirección puede hacer que la cuenta de Instagram le
 * escriba a quien quiera, con el texto que quiera.
 *
 * Falla CERRADO en los tres frentes: sin firma, con firma que no coincide, y
 * también cuando falta el secreto en el entorno. "No puedo comprobarlo" nunca
 * significa "dejalo pasar".
 *
 * El algoritmo es el mismo que el webhook de WhatsApp
 * (`lib/integrations/whatsapp/webhook.ts`), ya probado en producción.
 *
 * ## El parser no puede romperse
 *
 * Meta cambia sus formatos sin avisar. Un parser que tira una excepción tumba el
 * aviso ENTERO — incluidos los comentarios que sí entendíamos. Por eso todo lo
 * que viene de afuera se mira con desconfianza y lo que no se reconoce se
 * descarta en silencio, sin romper nada.
 */
import { createHmac, timingSafeEqual } from 'crypto'

export interface ComentarioDelAviso {
  /** Sin valor = Instagram (todo lo anterior a Facebook se escribió así). */
  plataforma?: 'instagram' | 'facebook'
  /**
   * De qué publicación es: en Instagram el id del media; en Facebook el id de la
   * publicación de la Página (`{página}_{post}`), que es lo que trae el aviso `feed`.
   */
  igMediaId: string
  comentarioId: string
  autorId: string
  username: string | null
  texto: string | null
  creadoEn: string
}

export interface BotonTocado {
  remitenteId: string
  dato: string
}

export function verificarFirmaInstagram(crudo: string, cabecera: string | null): boolean {
  const secreto = process.env.META_APP_SECRET
  if (!secreto) return false
  if (!cabecera) return false

  const prefijo = 'sha256='
  const provistoHex = cabecera.startsWith(prefijo) ? cabecera.slice(prefijo.length) : cabecera
  const esperadoHex = createHmac('sha256', secreto).update(crudo, 'utf8').digest('hex')

  const provisto = Buffer.from(provistoHex, 'hex')
  const esperado = Buffer.from(esperadoHex, 'hex')
  // El largo se compara ANTES: timingSafeEqual tira excepción con buffers de
  // distinto tamaño, y una excepción acá sería un 500 en vez de un 403.
  if (provisto.length !== esperado.length || provisto.length === 0) return false
  return timingSafeEqual(provisto, esperado)
}

/**
 * Clave para el desafío del alta, derivada del secreto de la app.
 *
 * Por qué existe: la `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` de Netlify mide más de 64 caracteres y
 * Meta rechaza el alta con "(#100) Param verify_token must be at most 64 characters long"
 * (2026-11-04). Esa variable es secreta en Netlify y no se puede leer para acortarla. Esta
 * clave solo la puede armar quien tiene `META_APP_SECRET`, y los avisos se siguen validando
 * con su firma: aceptarla no abre nada.
 */
export function claveDeVerificacionDerivada(secretoApp: string): string {
  return createHmac('sha256', secretoApp).update('verificacion-webhook-inmodf', 'utf8').digest('hex').slice(0, 48)
}

function igualesSeguro(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

export function esClaveDeVerificacion(
  token: string | null,
  opciones: { claveConfigurada: string | undefined; secretoApp: string | undefined },
): boolean {
  if (!token) return false
  if (opciones.claveConfigurada && igualesSeguro(token, opciones.claveConfigurada)) return true
  return !!opciones.secretoApp && igualesSeguro(token, claveDeVerificacionDerivada(opciones.secretoApp))
}

/* -------------------------------------------------------------------------- */
/*  Lectura defensiva: nada de esto confía en la forma del cuerpo              */
/* -------------------------------------------------------------------------- */

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function texto(x: unknown): string | null {
  return typeof x === 'string' && x.length > 0 ? x : null
}

function campo(objeto: unknown, clave: string): unknown {
  return esObjeto(objeto) ? objeto[clave] : undefined
}

function lista(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}

/**
 * La hora del evento que trae la ENTRADA del aviso (`entry.time`).
 *
 * Por qué hace falta: los ejemplos de Meta para comentarios de Instagram no
 * traen `timestamp` dentro de `value`, y la hora del comentario decide si es
 * "nuevo" (se responde) o "anterior a la activación" (se ignora). Sin esto, un
 * comentario real llegaba sin hora, se trataba como viejo y el sistema no le
 * respondía a nadie, en silencio. Meta la manda en segundos; se aceptan
 * milisegundos por las dudas. Lo que no sea un número razonable se descarta.
 */
function horaDelEvento(entrada: unknown): string | null {
  const t = campo(entrada, 'time')
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return null
  const ms = t > 1e12 ? t : t * 1000
  const fecha = new Date(ms)
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
}

function leerComentario(valor: unknown, horaEntrada: string | null): ComentarioDelAviso | null {
  const comentarioId = texto(campo(valor, 'id'))
  const igMediaId = texto(campo(campo(valor, 'media'), 'id'))
  const autorId = texto(campo(campo(valor, 'from'), 'id'))

  // Sin el id del reel no se sabe de qué propiedad se trata, y sin el del autor
  // no se le puede contestar. Los dos son imprescindibles.
  if (!comentarioId || !igMediaId || !autorId) return null

  return {
    igMediaId,
    comentarioId,
    autorId,
    username: texto(campo(campo(valor, 'from'), 'username')),
    texto: texto(campo(valor, 'text')),
    // Sin ninguna de las dos queda vacía: la decisión la trata como vieja y no
    // escribe. Ese motivo queda anotado en reel_comentarios, así que se ve.
    creadoEn: texto(campo(valor, 'timestamp')) ?? horaEntrada ?? '',
  }
}

function leerBoton(evento: unknown): BotonTocado | null {
  const mensaje = campo(evento, 'message')
  // Instagram nos avisa también de los mensajes que mandamos nosotros.
  if (campo(mensaje, 'is_echo') === true) return null

  const dato = texto(campo(campo(mensaje, 'quick_reply'), 'payload'))
  const remitenteId = texto(campo(campo(evento, 'sender'), 'id'))
  // Sin `quick_reply` es un mensaje escrito a mano. Tratarlo como botón haría
  // que cualquiera que escriba "hola" reciba el enlace de una landing al azar.
  if (!dato || !remitenteId) return null

  return { remitenteId, dato }
}

export function parsearAviso(cuerpo: unknown): {
  comentarios: ComentarioDelAviso[]
  botones: BotonTocado[]
} {
  const comentarios: ComentarioDelAviso[] = []
  const botones: BotonTocado[] = []

  for (const entrada of lista(campo(cuerpo, 'entry'))) {
    for (const cambio of lista(campo(entrada, 'changes'))) {
      if (campo(cambio, 'field') !== 'comments') continue
      const comentario = leerComentario(campo(cambio, 'value'), horaDelEvento(entrada))
      if (comentario) comentarios.push(comentario)
    }

    for (const evento of lista(campo(entrada, 'messaging'))) {
      const boton = leerBoton(evento)
      if (boton) botones.push(boton)
    }
  }

  return { comentarios, botones }
}

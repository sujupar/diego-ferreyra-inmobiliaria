/**
 * Reglas del publicador, sin red ni base (así se prueban).
 *
 * Un envío (video × red) avanza UNA etapa por corrida del cron. Acá se decide si
 * le toca salir, cuánto esperar ante un error y qué se le muestra a la persona.
 */
import type { EnvioFila, VideoFila } from '../tipos'

export type MotivoNoSale = 'terminado' | 'borrador' | 'pausado' | 'antes_de_hora' | 'apagado' | 'esperando_reintento'

const TERMINADOS = new Set(['publicado', 'cancelado', 'fallido'])

export function puedeSalir(
  envio: Pick<EnvioFila, 'estado' | 'proximo_intento'>,
  video: Pick<VideoFila, 'pausado' | 'programado_para'>,
  estadoTanda: 'borrador' | 'confirmada',
  automatica: boolean,
  ahora: Date,
): { sale: true } | { sale: false; motivo: MotivoNoSale } {
  if (TERMINADOS.has(envio.estado)) return { sale: false, motivo: 'terminado' }
  if (estadoTanda !== 'confirmada') return { sale: false, motivo: 'borrador' }
  if (video.pausado) return { sale: false, motivo: 'pausado' }
  if (!video.programado_para || Date.parse(video.programado_para) > ahora.getTime()) {
    return { sale: false, motivo: 'antes_de_hora' }
  }
  if (!automatica) return { sale: false, motivo: 'apagado' }
  // `proximo_intento` es también la reserva de una corrida: si está en el futuro,
  // otra corrida lo está trabajando o está esperando un reintento. Si venció, la
  // función que lo tenía murió a mitad y se retoma.
  if (envio.proximo_intento && Date.parse(envio.proximo_intento) > ahora.getTime()) {
    return { sale: false, motivo: 'esperando_reintento' }
  }
  return { sale: true }
}

const ESPERAS_MIN = [1, 2, 5, 15, 30]

/** Espera antes del reintento N (contando desde 1). `null` = no se reintenta más. */
export function esperaDeReintento(intentos: number): number | null {
  if (intentos < 1 || intentos > ESPERAS_MIN.length) return null
  return ESPERAS_MIN[intentos - 1] * 60_000
}

/** Códigos de Meta que significan "esperá y volvé a probar". */
const CODIGOS_TRANSITORIOS = new Set([1, 2, 4, 17, 32, 341, 368, 613])

export interface ErrorClasificado {
  transitorio: boolean
  mensaje: string
}

/** Límites de cuota de YouTube (diarios o por usuario): esperar, no rendirse. */
const MOTIVOS_DE_LIMITE_YT = new Set(['quotaExceeded', 'uploadLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded'])

export type RedQuePublica = 'Meta' | 'YouTube' | 'TikTok'

export function clasificarError(e: unknown, red: RedQuePublica = 'Meta'): ErrorClasificado {
  const x = (e ?? {}) as { code?: number; httpStatus?: number; message?: string; name?: string; motivo?: string | null }
  const code = typeof x.code === 'number' ? x.code : undefined
  const status = typeof x.httpStatus === 'number' ? x.httpStatus : undefined
  const crudo = (x.message ?? String(e)).replace(/^(Instagram|Facebook|YouTube|TikTok) \d{3}( al [^:]+)?: /, '').slice(0, 200)

  // La cuenta no está conectada o se revocó el permiso: el mensaje ya dice qué hacer, y el envío espera.
  if (x.name === 'ConexionVencida') return { transitorio: true, mensaje: x.message ?? `Volvé a conectar ${red}.` }
  if (red === 'Meta' && (code === 190 || status === 401)) {
    return { transitorio: true, mensaje: 'El permiso de Meta venció o se revocó. Avisale al administrador.' }
  }
  if (red !== 'Meta' && status === 401) {
    return { transitorio: true, mensaje: `El permiso de ${red} venció. Volvé a conectar ${red} en Ajustes de Publicaciones.` }
  }
  // TikTok admite pocos borradores sin terminar a la vez: al publicar o borrar alguno en la app, se reintenta solo.
  if (red === 'TikTok' && x.motivo === 'spam_risk_too_many_pending_share') {
    return { transitorio: true, mensaje: 'TikTok tiene demasiados borradores sin terminar: publicá o borrá alguno en la app y se reintenta solo.' }
  }
  if (red === 'TikTok' && (x.motivo === 'rate_limit_exceeded' || x.motivo === 'spam_risk_too_many_posts')) {
    return { transitorio: true, mensaje: 'TikTok pidió esperar (límite de subidas). Se reintenta solo.' }
  }
  if (red === 'YouTube' && x.motivo && MOTIVOS_DE_LIMITE_YT.has(x.motivo)) {
    return { transitorio: true, mensaje: 'YouTube llegó al límite de subidas del día. Se reintenta solo.' }
  }
  if ((code !== undefined && (CODIGOS_TRANSITORIOS.has(code) || (code >= 80001 && code <= 80014))) || status === 429) {
    return { transitorio: true, mensaje: `${red} pidió esperar (límite de publicaciones). Se reintenta solo.` }
  }
  if (status !== undefined && status >= 500) {
    return { transitorio: true, mensaje: `${red} no respondió bien. Se reintenta solo.` }
  }
  const esDeLaRed = status !== undefined || code !== undefined
  if (!esDeLaRed && ['TypeError', 'AbortError', 'TimeoutError'].includes(x.name ?? '')) {
    return { transitorio: true, mensaje: `Se cortó la conexión con ${red}. Se reintenta solo.` }
  }
  if (!esDeLaRed && /^DB: /.test(x.message ?? '')) {
    return { transitorio: true, mensaje: 'Falló la base de datos de la plataforma. Se reintenta solo.' }
  }
  // Sin códigos de la red, el error es nuestro: decir qué pasó sin culpar a nadie.
  if (!esDeLaRed) return { transitorio: false, mensaje: `No se pudo publicar: ${crudo}` }
  return { transitorio: false, mensaje: `${red} rechazó la publicación: ${crudo}` }
}

/**
 * "Reintentar" un envío fallido. NO borra la etapa ni los identificadores: con
 * ellos, la etapa le pregunta primero a Meta en qué quedó. Un envío puede figurar
 * fallido y estar publicado (se cortó justo después de publicar); arrancar de cero
 * ahí publicaba un segundo post idéntico. La marca `reintento` le dice a la etapa
 * que, si Meta CONFIRMA el error, ahí sí arranque de nuevo.
 */
export function cambiosDeReintento(envio: Pick<EnvioFila, 'etapa' | 'ids_externos'>): Record<string, unknown> {
  return {
    estado: envio.etapa === null ? 'programado' : 'en_curso',
    etapa: envio.etapa,
    ids_externos: { ...(envio.ids_externos ?? {}), reintento: true },
    intentos: 0,
    proximo_intento: null,
    ultimo_error: null,
  }
}

/** Lo que dice la fila de una red cuando el chip solo no alcanza. */
export function motivoEnPantalla(
  envio: Pick<EnvioFila, 'estado' | 'proximo_intento' | 'ultimo_error'>,
  video: Pick<VideoFila, 'programado_para'>,
  automatica: boolean,
  ahora: Date,
): string | null {
  if (envio.estado === 'fallido') return envio.ultimo_error ?? 'No se pudo publicar'
  if (envio.estado !== 'programado' && envio.estado !== 'en_curso') return null
  const yaEsHora = !!video.programado_para && Date.parse(video.programado_para) <= ahora.getTime()
  // Con el interruptor apagado nada avanza, aunque haya quedado a medio camino.
  if (yaEsHora && !automatica) return 'Esperando: publicación automática apagada'
  if (envio.estado === 'en_curso') return 'Publicando…'
  if (envio.ultimo_error && envio.proximo_intento && Date.parse(envio.proximo_intento) > ahora.getTime()) {
    return `Reintenta solo: ${envio.ultimo_error}`
  }
  return null
}

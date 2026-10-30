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

export function clasificarError(e: unknown): ErrorClasificado {
  const x = (e ?? {}) as { code?: number; httpStatus?: number; message?: string; name?: string }
  const code = typeof x.code === 'number' ? x.code : undefined
  const status = typeof x.httpStatus === 'number' ? x.httpStatus : undefined
  const crudo = (x.message ?? String(e)).replace(/^(Instagram|Facebook) \d{3}: /, '').slice(0, 200)

  if (code === 190 || status === 401) {
    return { transitorio: true, mensaje: 'El permiso de Meta venció o se revocó. Avisale al administrador.' }
  }
  if ((code !== undefined && (CODIGOS_TRANSITORIOS.has(code) || (code >= 80001 && code <= 80014))) || status === 429) {
    return { transitorio: true, mensaje: 'Meta pidió esperar (límite de publicaciones). Se reintenta solo.' }
  }
  if (status !== undefined && status >= 500) {
    return { transitorio: true, mensaje: 'Meta no respondió bien. Se reintenta solo.' }
  }
  const esDeMeta = status !== undefined || code !== undefined
  if (!esDeMeta && ['TypeError', 'AbortError', 'TimeoutError'].includes(x.name ?? '')) {
    return { transitorio: true, mensaje: 'Se cortó la conexión con Meta. Se reintenta solo.' }
  }
  if (!esDeMeta && /^DB: /.test(x.message ?? '')) {
    return { transitorio: true, mensaje: 'Falló la base de datos de la plataforma. Se reintenta solo.' }
  }
  // Sin códigos de Meta, el error es nuestro: decir qué pasó sin culpar a Meta.
  if (!esDeMeta) return { transitorio: false, mensaje: `No se pudo publicar: ${crudo}` }
  return { transitorio: false, mensaje: `Meta rechazó la publicación: ${crudo}` }
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

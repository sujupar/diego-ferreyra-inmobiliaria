/**
 * Etapas por las que pasa un video antes de poder programarse:
 *
 *   subiendo → extrayendo → transcribiendo → describiendo → listo
 *   (navegador)  (navegador)   (servidor)       (servidor)
 *
 * Las dos primeras las hace el navegador (subir el archivo, sacar miniatura y
 * audio). Las dos últimas, el servidor, UNA por request (regla de CLAUDE.md:
 * nunca encadenar llamadas de IA en un mismo request).
 */
import type { EtapaPreparacion, VideoFila } from './tipos'

export type AccionPreparacion = 'esperar_navegador' | 'transcribir' | 'describir' | 'nada'

export function siguienteAccion(
  v: Pick<VideoFila, 'etapa' | 'video_path' | 'audio_path' | 'miniatura_path'>,
): AccionPreparacion {
  switch (v.etapa) {
    case 'subiendo':
    case 'extrayendo':
      return 'esperar_navegador'
    case 'transcribiendo':
      return v.audio_path ? 'transcribir' : 'esperar_navegador'
    case 'describiendo':
      return 'describir'
    case 'listo':
    case 'error':
      return 'nada'
  }
}

export function etiquetaEtapa(etapa: EtapaPreparacion, progresoSubida?: number): string {
  switch (etapa) {
    case 'subiendo':
      return progresoSubida === undefined ? 'Subiendo' : `Subiendo ${Math.round(progresoSubida)} %`
    case 'extrayendo':
      return 'Preparando el audio'
    case 'transcribiendo':
      return 'Escuchando el audio'
    case 'describiendo':
      return 'Escribiendo la descripción'
    case 'listo':
      return 'Listo'
    case 'error':
      return 'No se pudo preparar'
  }
}

/** A qué etapa vuelve un video al tocar "Reintentar". */
export function reintentar(v: Pick<VideoFila, 'etapa' | 'error_etapa'>): EtapaPreparacion {
  if (v.etapa !== 'error') return v.etapa
  if (!v.error_etapa || v.error_etapa === 'error' || v.error_etapa === 'listo') return 'extrayendo'
  return v.error_etapa
}

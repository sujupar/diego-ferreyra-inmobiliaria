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

export function etiquetaEtapa(etapa: EtapaPreparacion, progresoSubida?: number, origen: 'subida' | 'drive' = 'subida'): string {
  switch (etapa) {
    case 'subiendo': {
      const verbo = origen === 'drive' ? 'Trayendo de Drive' : 'Subiendo'
      return progresoSubida === undefined ? verbo : `${verbo} ${Math.round(progresoSubida)} %`
    }
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

/**
 * Lo que se guarda al terminar el paso del navegador. La miniatura es OPCIONAL:
 * algunos navegadores (Safari, o Chrome con la pestaña en segundo plano) no
 * abren un video que no se ve, y frenar todo por la foto de portada dejaba el
 * video trabado en "El video tardó demasiado en abrirse". Lo que importa es el
 * audio; la duración, si no la dio el video, la da el audio.
 */
export function cambiosTrasExtraer(a: {
  miniaturaPath: string | null
  duracionVideo: number | null
  audioPath: string
  duracionAudio: number | null
}): Record<string, unknown> {
  const duracion = a.duracionVideo && a.duracionVideo > 0 ? a.duracionVideo : a.duracionAudio && a.duracionAudio > 0 ? a.duracionAudio : null
  return {
    ...(a.miniaturaPath ? { miniatura_path: a.miniaturaPath } : {}),
    audio_path: a.audioPath,
    ...(duracion !== null ? { duracion_seg: Math.round(duracion * 10) / 10 } : {}),
    etapa: 'transcribiendo',
  }
}

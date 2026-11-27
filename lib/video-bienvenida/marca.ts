/**
 * La marca del video de bienvenida en la fila de la cartera (D6). Puro.
 *
 * Solo se marca a quien tiene algo que mostrar: un enlace que salió por WhatsApp (y Meta no
 * avisó que falló), o uno que igual se abrió (por ejemplo, uno creado a mano que Paula mandó
 * por su cuenta). "No abrió el video" se dice solo si el enlace de verdad le llegó.
 */
import { porcentajeVisto } from './tramos'

export interface EnlaceParaMarca {
  enviadoAt: string | null
  envioFallidoAt: string | null
  aperturas: number
}

export interface VistaParaMarca {
  playbackStarted: boolean
  watchedBuckets: string | null
}

export type EstadoMarca = 'vio' | 'abrio' | 'no_abrio'

export function marcaVideo(enlace: EnlaceParaMarca | null, vista: VistaParaMarca | null): { texto: string; estado: EstadoMarca } | null {
  if (!enlace) return null
  if (vista?.playbackStarted) return { texto: `▶ Vio ${porcentajeVisto(vista.watchedBuckets)} %`, estado: 'vio' }
  if (enlace.aperturas > 0) return { texto: 'Abrió el video', estado: 'abrio' }
  const leLlego = !!enlace.enviadoAt && !enlace.envioFallidoAt
  return leLlego ? { texto: 'No abrió el video', estado: 'no_abrio' } : null
}

/**
 * Qué se hace con la automatización de comentarios cuando un video de
 * Publicaciones sale en una red. Módulo PURO: la base y Meta van en
 * `servidor/conexion.ts`.
 *
 * Un video que salió en Instagram Y en Facebook tiene UN solo reel en
 * `property_reels`: la primera red que sale lo crea y la segunda lo completa
 * con su identificador. Así la configuración es una sola y los contadores de la
 * ficha suman las dos redes.
 */
import { camposDelModo } from '@/lib/social/reels/modo'
import { validarAutomatizacion } from './automatizacion'

export type RedPublicada =
  | { plataforma: 'instagram'; igMediaId: string }
  | { plataforma: 'facebook'; fbVideoId: string; fbPostId: string }

export interface VideoParaConectar {
  id: string
  property_id: string | null
  automatizacion: unknown
  reel_id: string | null
  descripcion: string
}

export type PlanDeConexion =
  | { accion: 'nada'; motivo: 'sin_propiedad' | 'sin_configuracion' | 'configuracion_invalida' | 'sin_id_de_la_red'; detalle?: string }
  | { accion: 'crear'; fila: Record<string, unknown>; aviso?: string }
  | { accion: 'completar'; reelId: string; cambios: Record<string, string> }

export const AVISO_SIN_LANDING =
  'Quedó conectado pero Apagado: la propiedad no tiene la landing publicada (el botón del privado lleva ahí). Publicala y activalo desde la ficha.'

function idsDeLaRed(red: RedPublicada): Record<string, string> | null {
  if (red.plataforma === 'instagram') return red.igMediaId ? { ig_media_id: red.igMediaId } : null
  return red.fbVideoId && red.fbPostId ? { fb_video_id: red.fbVideoId, fb_post_id: red.fbPostId } : null
}

export function planDeConexion(a: {
  video: VideoParaConectar
  red: RedPublicada
  landingPublicada: boolean
  ahora: Date
}): PlanDeConexion {
  if (!a.video.property_id) return { accion: 'nada', motivo: 'sin_propiedad' }
  if (a.video.automatizacion === null || a.video.automatizacion === undefined) return { accion: 'nada', motivo: 'sin_configuracion' }
  // Se vuelve a validar: lo guardado pudo quedar viejo frente a una regla nueva.
  const config = validarAutomatizacion(a.video.automatizacion)
  if (!config.ok) return { accion: 'nada', motivo: 'configuracion_invalida', detalle: config.error }
  const ids = idsDeLaRed(a.red)
  if (!ids) return { accion: 'nada', motivo: 'sin_id_de_la_red' }

  if (a.video.reel_id) return { accion: 'completar', reelId: a.video.reel_id, cambios: ids }

  const c = config.valor
  // Sin landing, prendido mandaría un privado con un botón que no lleva a ningún lado.
  const modo = a.landingPublicada ? c.modo : 'apagado'
  const campos = camposDelModo(modo)
  const fila: Record<string, unknown> = {
    property_id: a.video.property_id,
    origen: 'existente',
    estado: 'publicado',
    publicado_en: a.ahora.toISOString(),
    descripcion: a.video.descripcion,
    palabra_clave: c.palabras || null,
    respuestas_con_privado: c.respuestas_con_privado,
    respuestas_sin_privado: c.respuestas_sin_privado,
    dm_texto: c.dm_texto,
    dm_boton: c.dm_boton,
    dm_seguimiento: c.dm_seguimiento,
    ...campos,
    automatizacion_desde: campos.automatizacion_activa ? a.ahora.toISOString() : null,
    ig_media_id: null,
    ...ids,
  }
  return !a.landingPublicada && c.modo !== 'apagado' ? { accion: 'crear', fila, aviso: AVISO_SIN_LANDING } : { accion: 'crear', fila }
}

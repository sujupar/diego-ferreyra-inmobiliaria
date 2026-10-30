/**
 * Tipos de las filas de Publicaciones (espejo de la migración
 * `20261029000010_publicaciones.sql`). Si cambia una columna, cambia acá también.
 */
import type { Ritmo } from './calendario'

export const PLATAFORMAS = ['instagram', 'facebook', 'youtube', 'tiktok'] as const
export type Plataforma = (typeof PLATAFORMAS)[number]

export const ETAPAS_PREPARACION = ['subiendo', 'extrayendo', 'transcribiendo', 'describiendo', 'listo', 'error'] as const
export type EtapaPreparacion = (typeof ETAPAS_PREPARACION)[number]

export const ESTADOS_ENVIO = ['programado', 'en_curso', 'publicado', 'fallido', 'cancelado'] as const
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number]

export interface Segmento {
  inicio: number
  fin: number
  texto: string
}

export interface TandaFila {
  id: string
  estado: 'borrador' | 'confirmada'
  ritmo: Ritmo | null
  inicio: string | null
  solo_habiles: boolean
  creada_por: string | null
  created_at: string
  updated_at: string
}

export interface VideoFila {
  id: string
  tanda_id: string
  orden: number
  origen: 'subida' | 'drive'
  drive_file_id: string | null
  nombre_archivo: string
  tamano_bytes: number
  video_path: string | null
  miniatura_path: string | null
  audio_path: string | null
  duracion_seg: number | null
  etapa: EtapaPreparacion
  error_etapa: EtapaPreparacion | null
  ultimo_error: string | null
  transcripcion: Segmento[] | null
  descripcion: string
  descripcion_editada: boolean
  titulo_youtube: string
  titulo_editado: boolean
  redes: Plataforma[]
  programado_para: string | null
  hora_manual: boolean
  pausado: boolean
  created_at: string
  updated_at: string
}

export interface EnvioFila {
  id: string
  video_id: string
  plataforma: Plataforma
  estado: EstadoEnvio
  etapa: string | null
  ids_externos: Record<string, unknown>
  enlace: string | null
  intentos: number
  proximo_intento: string | null
  ultimo_error: string | null
  created_at: string
  updated_at: string
}

/** Un video como lo ve la pantalla: con las URLs públicas ya armadas. */
export type VideoVista = VideoFila & { miniatura_url: string | null; video_url: string | null }

/** Un video programado, con el estado de cada red. */
export type VideoProgramado = VideoVista & { envios: EnvioFila[] }

/** Marca que `describir` deja en `ultimo_error` cuando el video no tiene voz. */
export const SIN_VOZ = 'sin_voz'

/**
 * Respaldo tardío del video de bienvenida (D3b). Puro.
 *
 * Si Meta clasifica la plantilla con video como MARKETING, puede aceptarla en el envío y
 * minutos después avisar por el webhook de estados que no la entregó: 131049 (la persona ya
 * recibió muchos mensajes de marketing) o 131050 (bloqueó el marketing). Ahí se manda
 * `tasacion_llamada_v1`, que es de utilidad y pasa. Mismo patrón que la encuesta
 * (lib/visitas/encuesta/respaldo.ts).
 *
 * "Una sola vez" no se decide acá: lo garantiza la RPC `video_bienvenida_tomar_respaldo`, que
 * marca `respaldo_at` de forma atómica y devuelve el contacto solo la primera vez.
 */
import { esPlantillaConVideo } from './plantillas'

export const CODIGOS_FRENO_MARKETING: readonly string[] = ['131049', '131050']

export function decidirRespaldoBienvenida(e: {
  estado: string
  codigoError: string | null
  plantillaDelMensaje: string | null
}): boolean {
  if (e.estado !== 'failed') return false
  if (!e.codigoError || !CODIGOS_FRENO_MARKETING.includes(e.codigoError)) return false
  return esPlantillaConVideo(e.plantillaDelMensaje)
}

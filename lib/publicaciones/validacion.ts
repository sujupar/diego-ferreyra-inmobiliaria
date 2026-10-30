/**
 * Validación de lo que llega a las rutas de Publicaciones.
 *
 * Los esquemas son `.strict()`: un campo que no está en la lista se rechaza, no se
 * ignora. Así nadie puede poner `estado: 'publicado'` o una ruta de Storage ajena
 * con un PATCH armado a mano.
 */
import { z } from 'zod'
import { LIMITES } from './textos'
import { PLATAFORMAS, type EtapaPreparacion } from './tipos'

export const TAMANO_MAXIMO = 209_715_200 // 200 MB, igual que el CHECK y el bucket
export const MAX_VIDEOS_POR_ALTA = 50

const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horario inválido')
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const plataforma = z.enum(PLATAFORMAS)
const diaSemana = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6),
])

export const ritmoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('todos_ya') }).strict(),
  z.object({ tipo: z.literal('por_dia'), cantidad: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
  z.object({ tipo: z.literal('por_semana') }).strict(),
  z
    .object({
      tipo: z.literal('personalizado'),
      porDia: z.number().int().min(1).max(5),
      dias: z.array(diaSemana).min(1).max(7),
      horarios: z.array(horario).min(1).max(5),
    })
    .strict(),
])

export const altaVideosSchema = z
  .object({
    archivos: z
      .array(
        z
          .object({
            nombre: z.string().trim().min(1).max(255),
            tamano: z.number().int().positive().max(TAMANO_MAXIMO),
            tipo: z.enum(['video/mp4', 'video/quicktime']),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_VIDEOS_POR_ALTA),
  })
  .strict()

/** Etapas que el navegador puede pedir; `listo` y `error` las pone solo el servidor. */
const ETAPAS_DEL_CLIENTE = ['subiendo', 'extrayendo', 'transcribiendo', 'describiendo'] as const

export const patchVideoSchema = z
  .object({
    descripcion: z.string().max(LIMITES.descripcion),
    titulo_youtube: z.string().max(LIMITES.tituloYoutube),
    redes: z.array(plataforma).max(PLATAFORMAS.length),
    programado_para: z.iso.datetime({ offset: true }).nullable(),
    hora_manual: z.boolean(),
    orden: z.number().int().min(0).max(10_000),
    pausado: z.boolean(),
    etapa: z.enum(ETAPAS_DEL_CLIENTE),
    duracion_seg: z.number().nonnegative().max(24 * 3600),
    miniatura_path: z.string().max(300),
    audio_path: z.string().max(300),
    video_path: z.string().max(300),
  })
  .partial()
  .strict()

export const patchTandaSchema = z
  .object({ ritmo: ritmoSchema, inicio: fecha, solo_habiles: z.boolean() })
  .partial()
  .strict()

/** `video` = volver a subir el archivo (al retomar una tanda sin el archivo en memoria). */
export const archivoSchema = z.object({ kind: z.enum(['miniatura', 'audio', 'video']) }).strict()

const NOMBRES_PROPIOS = new Set(['video.mp4', 'video.mov', 'miniatura.jpg', 'audio.wav'])

/** La ruta de Storage es de ESTE video: prefijo exacto con la barra final y uno de sus 4 archivos. */
export function esRutaPropia(path: string, tandaId: string, videoId: string): boolean {
  if (path.includes('..') || path.includes('//') || path.includes('\\')) return false
  const prefijo = `tandas/${tandaId}/${videoId}/`
  if (!path.startsWith(prefijo)) return false
  return NOMBRES_PROPIOS.has(path.slice(prefijo.length))
}

/** Pasos válidos de etapa pedidos por el navegador. */
export function transicionPermitida(
  actual: EtapaPreparacion,
  nueva: EtapaPreparacion,
  errorEtapa: EtapaPreparacion | null,
): boolean {
  if (actual === 'error') return nueva === (errorEtapa ?? 'extrayendo')
  if (actual === 'subiendo') return nueva === 'extrayendo'
  if (actual === 'extrayendo') return nueva === 'transcribiendo'
  return false
}

export function detectarDuplicados<N extends { nombre: string; tamano: number }>(
  existentes: { nombre_archivo: string; tamano_bytes: number }[],
  nuevos: N[],
): { nuevos: N[]; repetidos: string[] } {
  const clave = (nombre: string, tamano: number) => `${nombre.normalize('NFC')}\u0000${tamano}`
  const vistos = new Set(existentes.map((e) => clave(e.nombre_archivo, Number(e.tamano_bytes))))
  const salida: N[] = []
  const repetidos: string[] = []
  for (const n of nuevos) {
    const k = clave(n.nombre, n.tamano)
    if (vistos.has(k)) {
      repetidos.push(n.nombre)
      continue
    }
    vistos.add(k)
    salida.push(n)
  }
  return { nuevos: salida, repetidos }
}

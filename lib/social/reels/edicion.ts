/**
 * Qué se puede editar de un reel, y qué fecha de publicación es aceptable.
 *
 * ## Por qué hay una lista blanca y no una lista de prohibidos
 *
 * El cuerpo de un PATCH lo arma el navegador, o sea que viene de afuera. Sin
 * lista blanca, alguien podría mandar `ig_media_id` y apuntar el reel de una
 * propiedad a otra, o `estado: 'publicado'` para saltearse el candado de la
 * landing, o `property_id` para mover el reel a una ficha ajena.
 *
 * Este proyecto ya tiene ese agujero documentado en el `PUT` genérico de
 * propiedades, que acepta el cuerpo entero: un asesor podía mandar
 * `assigned_to` y reasignarse la propiedad de otro. Acá no se repite.
 *
 * Una lista de prohibidos falla ABIERTA: la columna que se agregue mañana queda
 * habilitada sin que nadie lo decida. Una lista blanca falla cerrada.
 */
import { separarPalabras } from './palabra-clave'

export interface CamposEditablesReel {
  descripcion?: string
  palabra_clave?: string | null
  dm_texto?: string | null
  dm_boton?: string
  dm_seguimiento?: string | null
  simulacro?: boolean
  automatizacion_activa?: boolean
  programado_para?: string | null
}

const PERMITIDOS = [
  'descripcion',
  'palabra_clave',
  'dm_texto',
  'dm_boton',
  'dm_seguimiento',
  'simulacro',
  'automatizacion_activa',
  'programado_para',
] as const

/** Un año por delante. Más que eso es un error de tipeo, no una intención. */
const MAXIMO_DIAS_ADELANTE = 365

export function camposEditables(entrada: CamposEditablesReel): Record<string, unknown> {
  const salida: Record<string, unknown> = {}

  for (const clave of PERMITIDOS) {
    const valor = entrada[clave]
    // `undefined` es "no vino"; `false` y `null` son valores legítimos. Filtrar
    // por "truthy" haría imposible apagar el simulacro: se quedaría prendido
    // para siempre y el sistema nunca hablaría.
    if (valor === undefined) continue

    // Los topes (10 palabras, 200 caracteres) los hace cumplir la ruta con
    // `limpiarPalabras` ANTES de llegar acá, para poder contestar con el motivo.
    // Acá solo se normaliza la forma: la lista vacía se guarda como null, que
    // es lo que impide activar un reel sin palabra.
    if (clave === 'palabra_clave' && typeof valor === 'string') {
      salida[clave] = separarPalabras(valor).join(', ') || null
      continue
    }
    salida[clave] = valor
  }

  return salida
}

export type ResultadoValidacion = { ok: true } | { ok: false; error: string }

/**
 * ¿Se puede programar para esta fecha?
 *
 * Sin fecha significa "publicar ahora", que es válido.
 */
export function validarProgramacion(
  programadoPara: string | null | undefined,
  ahora: Date,
): ResultadoValidacion {
  if (!programadoPara) return { ok: true }

  const fecha = new Date(programadoPara)
  if (Number.isNaN(fecha.getTime())) {
    return { ok: false, error: 'La fecha de publicación no se entiende.' }
  }

  if (fecha.getTime() <= ahora.getTime()) {
    // Con una fecha pasada el cron lo publicaría en la corrida siguiente, o sea
    // "ya" — que no es lo que el asesor pidió al elegir programarlo.
    return { ok: false, error: 'La fecha de publicación tiene que ser futura.' }
  }

  const diasAdelante = (fecha.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000)
  if (diasAdelante > MAXIMO_DIAS_ADELANTE) {
    // Un error de tipeo en el año dejaría el reel colgado para siempre sin que
    // nadie entienda por qué nunca salió.
    return { ok: false, error: 'La fecha está demasiado lejana. ¿Está bien el año?' }
  }

  return { ok: true }
}

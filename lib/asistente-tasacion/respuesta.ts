/**
 * Forma de la respuesta del asistente: BLOQUES, no texto libre.
 *
 * POR QUÉ: el principio rector del spec es explicar algo complejo de forma que
 * lo entienda cualquiera, ordenado. Eso se garantiza mejor con estructura que
 * con instrucciones: el primer bloque es SIEMPRE el resumen en una frase, y los
 * pasos, tablas y borradores tienen su forma. Además el repo no tiene un
 * renderizador de markdown y el texto de un modelo no se inyecta como HTML.
 */
import { z } from 'zod'
import { UBICACION_MIN, UBICACION_MAX } from '../valuation/tasador-ia'

const texto = (max: number) => z.string().trim().min(1).max(max)

const bloqueSchema = z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('resumen'), texto: texto(400) }),
    z.object({ tipo: z.literal('pasos'), items: z.array(z.object({ titulo: texto(120), texto: texto(800) })).min(1).max(12) }),
    z.object({ tipo: z.literal('tabla'), columnas: z.array(texto(60)).min(1).max(8), filas: z.array(z.array(z.string().max(120))).max(20) }),
    z.object({ tipo: z.literal('texto'), texto: texto(2000) }),
    z.object({ tipo: z.literal('borrador'), destinatario: texto(80), texto: texto(3000) }),
])
export type BloqueRespuesta = z.infer<typeof bloqueSchema>

const CALIDADES = ['ECONOMIC', 'GOOD_ECONOMIC', 'GOOD', 'VERY_GOOD', 'EXCELLENT'] as const
const ESTADOS = ['STATE_1', 'STATE_1_5', 'STATE_2', 'STATE_2_5', 'STATE_3', 'STATE_3_5', 'STATE_4', 'STATE_4_5', 'STATE_5'] as const
const DISPOSICIONES = ['FRONT', 'BACK', 'LATERAL', 'INTERNAL'] as const

const base = { objetivo: z.enum(['sujeto', 'comparable']), indice: z.number().int().min(0).optional(), motivo: z.string().trim().max(400) }
const propuestaSchema = z.discriminatedUnion('campo', [
    z.object({ ...base, campo: z.literal('locationCoefficient'), valor: z.number().min(UBICACION_MIN, 'ubicación fuera de rango').max(UBICACION_MAX, 'ubicación fuera de rango') }),
    z.object({ ...base, campo: z.literal('quality'), valor: z.enum(CALIDADES) }),
    z.object({ ...base, campo: z.literal('conservationState'), valor: z.enum(ESTADOS) }),
    z.object({ ...base, campo: z.literal('disposition'), valor: z.enum(DISPOSICIONES) }),
    z.object({ ...base, campo: z.literal('floor'), valor: z.number().int().min(0).max(60) }),
    z.object({ ...base, campo: z.literal('age'), valor: z.number().min(0).max(150) }),
]).refine(p => p.objetivo === 'sujeto' || p.indice !== undefined, { message: 'una propuesta sobre un comparable necesita su índice' })
export type PropuestaDeAjuste = z.infer<typeof propuestaSchema>

const respuestaSchema = z.object({
    bloques: z.array(bloqueSchema).min(1).max(10)
        .refine(b => b[0]?.tipo === 'resumen', { message: 'el primer bloque tiene que ser el resumen en una frase' }),
    propuesta: propuestaSchema.optional().nullable().transform(p => p ?? undefined),
})
export type RespuestaAsistente = z.infer<typeof respuestaSchema>

export class ErrorRespuestaAsistente extends Error {}

export function validarRespuesta(raw: unknown): RespuestaAsistente {
    const r = respuestaSchema.safeParse(raw)
    if (!r.success) {
        const p = r.error.issues[0]
        throw new ErrorRespuestaAsistente(`respuesta inválida del modelo (${p?.path.join('.') || 'respuesta'}: ${p?.message ?? 'forma inesperada'})`)
    }
    return r.data
}

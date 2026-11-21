/**
 * Reels de Instagram con respuesta automática: cuánto rinde cada uno, desde que
 * se publicó y en el período. Módulo puro.
 *
 * Camino de una persona: ve el reel → comenta la palabra → recibe el privado con
 * el enlace (`utm_content=reel_<id8>`) → visita la página → se registra. Cada
 * paso sale de la plataforma; solo las VISTAS del reel salen de Instagram (en
 * vivo, quien llama las pasa en `vistas`, y pueden faltar).
 */

import { dia } from '../panel/personas'
import { enRango, type Rango } from '../panel/rango'
import { clavePersona, type LeadRow } from './comercial'

export interface ReelRow {
  id: string
  property_id: string | null
  automatizacion_activa: boolean | null
  simulacro: boolean | null
  publicado_en: string | null
  ig_media_id: string | null
}

export interface ComentarioReelRow {
  reel_id: string
  coincide: boolean | null
  /** Respuestas simuladas del modo prueba: no son comentarios de gente. */
  simulado: boolean | null
  dm_enviado_en: string | null
  created_at: string
  ig_user_id: string | null
}

export interface VisitaReelRow { utm_content: string | null; visited_at: string }

export interface FilaReel {
  reelId: string
  propiedadId: string | null
  direccion: string | null
  publicado: string | null
  /** Respuesta automática prendida y EN VIVO (no en modo prueba). */
  conRespuesta: boolean
  /** Vistas según Instagram; null si no se pudo leer. */
  vistas: number | null
  comentarios: number
  personasComentaron: number
  privados: number
  visitas: number
  registros: number
  personasRegistradas: number
  comentariosPorRegistro: number | null
  privadosPorRegistro: number | null
  periodo: { comentarios: number; privados: number; visitas: number; registros: number }
}

const div = (a: number, b: number) => (b ? a / b : null)
const marca = (id: string) => 'reel_' + id.slice(0, 8)

export function resumenReels(x: {
  reels: ReelRow[]
  comentarios: ComentarioReelRow[]
  visitas: VisitaReelRow[]
  leads: LeadRow[]
  direcciones: Map<string, string | null>
  vistas: Map<string, number | null>
  rango: Rango
}) {
  const filas: FilaReel[] = x.reels.map(r => {
    const coms = x.comentarios.filter(c => c.reel_id === r.id && !c.simulado)
    const privados = coms.filter(c => c.dm_enviado_en)
    const vis = x.visitas.filter(v => v.utm_content === marca(r.id))
    const regs = x.leads.filter(l => !l.suspected_bot && !l.deleted_at && (l.utm as Record<string, unknown> | null)?.utm_content === marca(r.id))
    const personas = new Set(regs.map((l, i) => clavePersona(l) ?? `sin:${i}`))
    const conRespuesta = !!r.automatizacion_activa && !r.simulacro
    const enPeriodo = (iso: string | null) => enRango(dia(iso), x.rango)
    return {
      reelId: r.id,
      propiedadId: r.property_id,
      direccion: r.property_id ? x.direcciones.get(r.property_id) ?? null : null,
      publicado: dia(r.publicado_en),
      conRespuesta,
      vistas: r.ig_media_id ? x.vistas.get(r.ig_media_id) ?? null : null,
      comentarios: coms.length,
      personasComentaron: new Set(coms.map(c => c.ig_user_id).filter(Boolean)).size,
      privados: privados.length,
      visitas: vis.length,
      registros: regs.length,
      personasRegistradas: personas.size,
      comentariosPorRegistro: conRespuesta ? div(coms.length, personas.size) : null,
      privadosPorRegistro: conRespuesta ? div(privados.length, personas.size) : null,
      periodo: {
        comentarios: coms.filter(c => enPeriodo(c.created_at)).length,
        privados: privados.filter(c => enPeriodo(c.dm_enviado_en)).length,
        visitas: vis.filter(v => enPeriodo(v.visited_at)).length,
        registros: regs.filter(l => enPeriodo(l.created_at)).length,
      },
    }
  })
  filas.sort((a, b) => Number(b.conRespuesta) - Number(a.conRespuesta) || (b.vistas ?? 0) - (a.vistas ?? 0))
  const con = filas.filter(f => f.conRespuesta)
  const suma = (k: 'comentarios' | 'personasComentaron' | 'privados' | 'visitas' | 'personasRegistradas') => con.reduce((a, f) => a + f[k], 0)
  const vistas = con.every(f => f.vistas != null) ? con.reduce((a, f) => a + (f.vistas ?? 0), 0) : null
  const personasRegistradas = suma('personasRegistradas')
  return {
    filas,
    total: {
      vistas,
      comentarios: suma('comentarios'),
      personasComentaron: suma('personasComentaron'),
      privados: suma('privados'),
      visitas: suma('visitas'),
      personasRegistradas,
      comentariosPorRegistro: div(suma('comentarios'), personasRegistradas),
      privadosPorRegistro: div(suma('privados'), personasRegistradas),
      vistasPorRegistro: vistas == null ? null : div(vistas, personasRegistradas),
    },
  }
}

export type ResumenReels = ReturnType<typeof resumenReels>

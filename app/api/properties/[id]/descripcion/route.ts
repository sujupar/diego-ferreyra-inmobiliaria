/**
 * GET  /api/properties/[id]/descripcion → estado: qué falta, qué preguntas
 *      quedan (las que no se contestaron en la visita ni en la landing), qué hay
 *      en caché y en qué portales está publicada.
 * POST /api/properties/[id]/descripcion → corre UNA etapa del método de Diego
 *      ({ etapa: 'fotos' | 'zona' | 'escribir', … }). El panel las encadena.
 *
 * Una etapa por pedido y una llamada de IA por etapa: ver `lib/descripcion/servicio.ts`.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import {
  estadoDescripcion, ejecutarEtapaFotos, ejecutarEtapaZona, ejecutarEtapaEscribir,
} from '@/lib/descripcion/servicio'
import { autorizarDescripcion, respuestaDeError } from './autorizar'

export const maxDuration = 60

const EtapaSchema = z.object({
  etapa: z.enum(['fotos', 'zona', 'escribir']),
  forzar: z.boolean().optional(),
  respuestas: z.record(z.string(), z.string().max(2000)).optional(),
  notas: z.string().max(2000).nullable().optional(),
  comprador: z.string().max(500).nullable().optional(),
  corregir: z.array(z.string().max(300)).max(10).optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const { id } = await params
  try {
    if (!(await autorizarDescripcion(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json(await estadoDescripcion(id))
  } catch (err) {
    return respuestaDeError(err, 'estado')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const { id } = await params
  try {
    if (!(await autorizarDescripcion(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const parsed = EtapaSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Pedido inválido.', detail: parsed.error.flatten() }, { status: 400 })
    }
    const p = parsed.data
    if (p.etapa === 'fotos') return NextResponse.json(await ejecutarEtapaFotos(id, { forzar: p.forzar }))
    if (p.etapa === 'zona') return NextResponse.json(await ejecutarEtapaZona(id, { forzar: p.forzar }))
    return NextResponse.json(await ejecutarEtapaEscribir(id, {
      respuestas: p.respuestas, notas: p.notas, comprador: p.comprador, corregir: p.corregir,
    }))
  } catch (err) {
    return respuestaDeError(err, 'etapa')
  }
}

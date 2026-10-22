import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { autorizarInformesDe } from '@/lib/informes/acceso'
import { leerPropiedad, listarInformes } from '@/lib/informes/datos'
import { crearInformeManual } from '@/lib/informes/servicio'
import { respuestaDeError } from '@/lib/informes/rutas'
import { cicloDeLaPropiedad, quincenaQueCerro, recortarALaCaptacion } from '@/lib/informes/periodo'
import { fechaEnArgentina } from '@/lib/visitas/horario'

export const dynamic = 'force-dynamic'

/**
 * Los informes de una propiedad (pestaña "Informes" de la ficha) y "Nuevo informe" con fechas.
 * El GET trae también los atajos del selector: la última quincena y el ciclo de la propiedad.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarInformesDe(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const [informes, propiedad] = await Promise.all([listarInformes(id), leerPropiedad(id)])
    if (!propiedad) return NextResponse.json({ error: 'No encontramos la propiedad' }, { status: 404 })
    const hoy = fechaEnArgentina(new Date())
    const captada = propiedad.capturadaEl ? fechaEnArgentina(new Date(propiedad.capturadaEl)) : null
    return NextResponse.json({
      data: {
        informes: informes.map(i => ({ id: i.id, desde: i.desde, hasta: i.hasta, origen: i.origen, estado: i.estado, listoAt: i.listoAt, createdAt: i.createdAt })),
        atajos: {
          ultimaQuincena: recortarALaCaptacion(quincenaQueCerro(hoy), captada),
          cicloDeLaPropiedad: captada ? cicloDeLaPropiedad(captada, hoy) : null,
        },
      },
    })
  } catch (e) {
    return respuestaDeError(e, 'listar informes')
  }
}

const cuerpo = z.object({ desde: z.string().max(10), hasta: z.string().max(10) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarInformesDe(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  const p = cuerpo.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Elegí las fechas del informe' }, { status: 400 })
  try {
    const r = await crearInformeManual(id, p.data.desde, p.data.hasta, a.userId, new Date())
    return NextResponse.json({ data: { id: r.informe.id, nuevo: r.nuevo } }, { status: r.nuevo ? 201 : 200 })
  } catch (e) {
    return respuestaDeError(e, 'crear informe')
  }
}

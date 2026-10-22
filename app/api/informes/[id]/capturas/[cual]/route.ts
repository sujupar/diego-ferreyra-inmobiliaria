import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cargarInforme, respuestaDeError } from '@/lib/informes/rutas'
import { confirmarCaptura, prepararCaptura, quitarCaptura } from '@/lib/informes/servicio'
import { CAPTURAS, type NombreCaptura } from '@/lib/informes/tipos'

export const dynamic = 'force-dynamic'

/**
 * Capturas de pantalla de los portales sin API (Zonaprop, Argenprop, ML, TikTok). Subida directa a
 * Storage: POST firma (valida lo declarado) → PUT del navegador → PUT acá confirma por los BYTES.
 */
function captura(cual: string): NombreCaptura | null {
  return (CAPTURAS as readonly string[]).includes(cual) ? (cual as NombreCaptura) : null
}

const meta = z.object({ nombre: z.string().min(1).max(200), bytes: z.number().int().positive() }).strict()
const confirmar = z.object({ path: z.string().max(300) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; cual: string }> }) {
  const { id, cual } = await params
  const k = captura(cual)
  if (!k) return NextResponse.json({ error: 'Captura desconocida' }, { status: 404 })
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  const p = meta.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Datos del archivo inválidos' }, { status: 400 })
  try {
    return NextResponse.json({ data: await prepararCaptura(c.informe, k, p.data) })
  } catch (e) {
    return respuestaDeError(e, 'preparar captura')
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; cual: string }> }) {
  const { id, cual } = await params
  const k = captura(cual)
  if (!k) return NextResponse.json({ error: 'Captura desconocida' }, { status: 404 })
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  const p = confirmar.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Datos de la captura inválidos' }, { status: 400 })
  try {
    return NextResponse.json({ data: await confirmarCaptura(c.informe, k, p.data.path) })
  } catch (e) {
    return respuestaDeError(e, 'confirmar captura')
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; cual: string }> }) {
  const { id, cual } = await params
  const k = captura(cual)
  if (!k) return NextResponse.json({ error: 'Captura desconocida' }, { status: 404 })
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  try {
    return NextResponse.json({ data: await quitarCaptura(c.informe, k) })
  } catch (e) {
    return respuestaDeError(e, 'quitar captura')
  }
}

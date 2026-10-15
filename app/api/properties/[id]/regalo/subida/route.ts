import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { autorizarRegalo } from '@/lib/visitas/encuesta/acceso-regalo'
import * as datos from '@/lib/visitas/encuesta/datos'
import { validarArchivoRegalo, validarPortada, pathDelRegalo, pathDePortada } from '@/lib/visitas/encuesta/regalo'

/**
 * Prepara la subida directa a Storage (bucket privado) del PDF y/o la portada. El archivo NUNCA pasa
 * por el servidor de Next (CLAUDE.md § Multimedia): acá solo se valida y se firma.
 */
const meta = z.object({ nombre: z.string().min(1).max(200), bytes: z.number().int().positive() }).strict()
const cuerpo = z.object({ archivo: meta.nullish(), portada: meta.nullish() }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarRegalo(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  const parsed = cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos del archivo inválidos' }, { status: 400 })
  const { archivo, portada } = parsed.data
  if (!archivo && !portada) return NextResponse.json({ error: 'No hay nada para subir' }, { status: 400 })
  const errArchivo = archivo ? validarArchivoRegalo(archivo) : null
  if (errArchivo) return NextResponse.json({ error: errArchivo }, { status: 400 })
  const errPortada = portada ? validarPortada(portada) : null
  if (errPortada) return NextResponse.json({ error: errPortada }, { status: 400 })
  try {
    return NextResponse.json({
      data: {
        archivo: archivo ? await datos.crearSubidaFirmada(pathDelRegalo(id, randomUUID())) : null,
        portada: portada ? await datos.crearSubidaFirmada(pathDePortada(id, randomUUID(), portada.nombre)) : null,
      },
    })
  } catch (e) {
    console.error('[POST /api/properties/[id]/regalo/subida]', e)
    return NextResponse.json({ error: 'No pudimos preparar la subida. Probá de nuevo.' }, { status: 500 })
  }
}

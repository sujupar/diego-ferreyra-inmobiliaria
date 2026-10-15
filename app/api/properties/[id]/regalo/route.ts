import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { autorizarRegalo } from '@/lib/visitas/encuesta/acceso-regalo'
import * as datos from '@/lib/visitas/encuesta/datos'
import {
  esPathDelRegalo, esPathDePortada, nombreDeDescarga, validarArchivoRegalo, validarTitulo,
  SEGUNDOS_URL_DESCARGA, SEGUNDOS_URL_PORTADA, type RegaloVista,
} from '@/lib/visitas/encuesta/regalo'
import type { RegaloDeLaPropiedad } from '@/lib/visitas/encuesta/tipos'

/**
 * El regalo de la encuesta de UNA propiedad (adenda §11.2). Los paths que manda el navegador se
 * validan con regex exacta atada al id (y la base repite el CHECK) y se confirma que el archivo
 * exista antes de guardarlo. Reemplazar borra los archivos viejos (best-effort).
 */
const cuerpoPut = z.object({
  titulo: z.string().max(400),
  archivoPath: z.string().max(300),
  archivoNombre: z.string().min(1).max(200),
  archivoBytes: z.number().int().positive(),
  portadaPath: z.string().max(300).nullable(),
}).strict()

async function vista(r: RegaloDeLaPropiedad): Promise<RegaloVista> {
  return {
    titulo: r.titulo,
    archivoNombre: r.archivoNombre,
    archivoBytes: r.archivoBytes,
    archivoPath: r.archivoPath,
    portadaPath: r.portadaPath,
    portadaUrl: r.portadaPath ? await datos.urlFirmada(r.portadaPath, SEGUNDOS_URL_PORTADA) : null,
    descargaUrl: await datos.urlFirmada(r.archivoPath, SEGUNDOS_URL_DESCARGA, nombreDeDescarga(r.archivoNombre)),
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarRegalo(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const r = await datos.leerRegalo(id)
    return NextResponse.json({ data: r ? await vista(r) : null })
  } catch (e) {
    console.error('[GET /api/properties/[id]/regalo]', e)
    return NextResponse.json({ error: 'No pudimos cargar el regalo' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarRegalo(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  const parsed = cuerpoPut.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos del regalo inválidos' }, { status: 400 })
  const b = parsed.data
  const t = validarTitulo(b.titulo)
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 })
  if (!esPathDelRegalo(b.archivoPath, id)) return NextResponse.json({ error: 'El archivo no corresponde a esta propiedad' }, { status: 400 })
  if (b.portadaPath !== null && !esPathDePortada(b.portadaPath, id)) return NextResponse.json({ error: 'La portada no corresponde a esta propiedad' }, { status: 400 })
  const nombre = nombreDeDescarga(b.archivoNombre)
  const errArchivo = validarArchivoRegalo({ nombre, bytes: b.archivoBytes })
  if (errArchivo) return NextResponse.json({ error: errArchivo }, { status: 400 })
  try {
    const subidos = await Promise.all([datos.existeArchivo(b.archivoPath), b.portadaPath ? datos.existeArchivo(b.portadaPath) : Promise.resolve(true)])
    if (subidos.includes(false)) return NextResponse.json({ error: 'El archivo no terminó de subir. Probá de nuevo.' }, { status: 400 })
    const anterior = await datos.leerRegalo(id)
    await datos.guardarRegalo({ propertyId: id, titulo: t.titulo, archivoPath: b.archivoPath, archivoNombre: nombre, archivoBytes: b.archivoBytes, portadaPath: b.portadaPath, actorId: a.userId })
    if (anterior) {
      const viejos = [anterior.archivoPath, anterior.portadaPath].filter((p): p is string => !!p && p !== b.archivoPath && p !== b.portadaPath)
      await datos.borrarArchivos(viejos)
    }
    const actual = await datos.leerRegalo(id)
    if (!actual) throw new Error('el regalo no quedó guardado')
    return NextResponse.json({ data: await vista(actual) })
  } catch (e) {
    console.error('[PUT /api/properties/[id]/regalo]', e)
    return NextResponse.json({ error: 'No pudimos guardar el regalo. Probá de nuevo.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarRegalo(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const anterior = await datos.leerRegalo(id)
    if (anterior) {
      await datos.borrarRegalo(id)
      await datos.borrarArchivos([anterior.archivoPath, anterior.portadaPath].filter((p): p is string => !!p))
    }
    return NextResponse.json({ data: null })
  } catch (e) {
    console.error('[DELETE /api/properties/[id]/regalo]', e)
    return NextResponse.json({ error: 'No pudimos quitar el regalo. Probá de nuevo.' }, { status: 500 })
  }
}

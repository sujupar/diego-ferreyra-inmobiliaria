import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { autorizarRegaloGeneral } from '@/lib/visitas/encuesta/acceso-regalo'
import * as datos from '@/lib/visitas/encuesta/datos'
import {
  esPathDelRegaloGeneral, esPathDePortadaGeneral, nombreDeDescarga, validarArchivoRegalo, validarTitulo,
  SEGUNDOS_URL_DESCARGA, SEGUNDOS_URL_PORTADA, type RegaloVista,
} from '@/lib/visitas/encuesta/regalo'
import { verificarArchivosSubidos } from '@/lib/visitas/encuesta/verificar-subida'
import type { RegaloGeneral } from '@/lib/visitas/encuesta/tipos'

/**
 * El regalo GENERAL de la encuesta (spec 2026-10-17-regalo-guia-compradores-design.md): uno solo
 * para todas las visitas, y si existe MANDA sobre el de cada propiedad. Mismo flujo y mismas
 * validaciones que el regalo de una propiedad (`app/api/properties/[id]/regalo`), con los paths en
 * `general/`. Ver: todo el equipo menos el abogado. Cambiarlo: admin y dueño.
 */
const cuerpoPut = z.object({
  titulo: z.string().max(400),
  archivoPath: z.string().max(300),
  archivoNombre: z.string().min(1).max(200),
  archivoBytes: z.number().int().positive(),
  portadaPath: z.string().max(300).nullable(),
}).strict()

async function vista(r: RegaloGeneral): Promise<RegaloVista> {
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

export async function GET() {
  const a = await autorizarRegaloGeneral('ver')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const r = await datos.leerRegaloGeneral()
    return NextResponse.json({ data: r ? await vista(r) : null })
  } catch (e) {
    console.error('[GET /api/settings/encuesta-visitas/regalo-general]', e)
    return NextResponse.json({ error: 'No pudimos cargar el regalo general' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const a = await autorizarRegaloGeneral('administrar')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  const parsed = cuerpoPut.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos del regalo inválidos' }, { status: 400 })
  const b = parsed.data
  const t = validarTitulo(b.titulo)
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 })
  if (!esPathDelRegaloGeneral(b.archivoPath)) return NextResponse.json({ error: 'El archivo no corresponde al regalo general' }, { status: 400 })
  if (b.portadaPath !== null && !esPathDePortadaGeneral(b.portadaPath)) return NextResponse.json({ error: 'La portada no corresponde al regalo general' }, { status: 400 })
  const nombre = nombreDeDescarga(b.archivoNombre)
  const errArchivo = validarArchivoRegalo({ nombre, bytes: b.archivoBytes })
  if (errArchivo) return NextResponse.json({ error: errArchivo }, { status: 400 })
  try {
    const v = await verificarArchivosSubidos(b.archivoPath, b.portadaPath)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status })
    const anterior = await datos.leerRegaloGeneral()
    await datos.guardarRegaloGeneral({ titulo: t.titulo, archivoPath: b.archivoPath, archivoNombre: nombre, archivoBytes: v.bytesReales, portadaPath: b.portadaPath, actorId: a.userId })
    if (anterior) {
      const viejos = [anterior.archivoPath, anterior.portadaPath].filter((p): p is string => !!p && p !== b.archivoPath && p !== b.portadaPath)
      await datos.borrarArchivos(viejos)
    }
    const actual = await datos.leerRegaloGeneral()
    if (!actual) throw new Error('el regalo general no quedó guardado')
    return NextResponse.json({ data: await vista(actual) })
  } catch (e) {
    console.error('[PUT /api/settings/encuesta-visitas/regalo-general]', e)
    return NextResponse.json({ error: 'No pudimos guardar el regalo general. Probá de nuevo.' }, { status: 500 })
  }
}

export async function DELETE() {
  const a = await autorizarRegaloGeneral('administrar')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const anterior = await datos.leerRegaloGeneral()
    if (anterior) {
      await datos.borrarRegaloGeneral()
      await datos.borrarArchivos([anterior.archivoPath, anterior.portadaPath].filter((p): p is string => !!p))
    }
    return NextResponse.json({ data: null })
  } catch (e) {
    console.error('[DELETE /api/settings/encuesta-visitas/regalo-general]', e)
    return NextResponse.json({ error: 'No pudimos quitar el regalo general. Probá de nuevo.' }, { status: 500 })
  }
}

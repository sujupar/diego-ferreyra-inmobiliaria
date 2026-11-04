import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { listarDrive } from '@/lib/publicaciones/servidor/drive'
import { leerBody, respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { listarDriveSchema } from '@/lib/publicaciones/validacion'

// POST: lista los videos de un enlace de Drive (carpeta o archivo) para elegir cuáles traer.
export async function POST(req: Request) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { enlace } = await leerBody(req, listarDriveSchema)
    return NextResponse.json(await listarDrive(enlace))
  } catch (e) {
    return respuestaDeError(e, 'listar drive')
  }
}

import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { listarPublicado } from '@/lib/publicaciones/servidor/tandas'

// GET: lo publicado y lo que falló en los últimos 60 días, por video.
export async function GET() {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    return NextResponse.json(await listarPublicado())
  } catch (e) {
    return respuestaDeError(e, 'publicado')
  }
}

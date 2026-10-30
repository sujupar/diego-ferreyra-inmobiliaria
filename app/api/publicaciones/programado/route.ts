import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { listarProgramado } from '@/lib/publicaciones/servidor/tandas'

// GET: videos programados (desde ayer en adelante) con el estado de cada red.
export async function GET() {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    return NextResponse.json(await listarProgramado())
  } catch (e) {
    return respuestaDeError(e, 'programado')
  }
}

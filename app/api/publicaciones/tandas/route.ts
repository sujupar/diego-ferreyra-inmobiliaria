import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { crearTanda, listarBorradores } from '@/lib/publicaciones/servidor/tandas'

// GET: tandas a medio armar (para "Seguir con la tanda…").
export async function GET() {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    return NextResponse.json({ borradores: await listarBorradores() })
  } catch (e) {
    return respuestaDeError(e, 'listar tandas')
  }
}

// POST: empieza una tanda nueva.
export async function POST() {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    return NextResponse.json({ tanda: await crearTanda(auth.user.id) })
  } catch (e) {
    return respuestaDeError(e, 'crear tanda')
  }
}

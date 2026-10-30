import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { avanzarAprendizaje, resumenEstilo } from '@/lib/publicaciones/servidor/estilo'
import { leerBody, respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { aprenderSchema } from '@/lib/publicaciones/validacion'

// POST: avanza UNA etapa de aprender el estilo. `{ empezar: true }` vuelve a
// aprender aunque ya haya una guía (la anterior sigue vigente hasta terminar).
export async function POST(req: Request) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { empezar } = await leerBody(req, aprenderSchema)
    const estilo = await avanzarAprendizaje(empezar === true)
    return NextResponse.json({ estilo: resumenEstilo(estilo) })
  } catch (e) {
    return respuestaDeError(e, 'aprender estilo')
  }
}

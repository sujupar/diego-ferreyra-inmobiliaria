import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { accionesDisponibles } from '@/lib/visitas/transiciones'
import { puedeVerVisita } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/** Ficha de la visita con su historial y las acciones posibles AHORA (calculadas con la hora del servidor). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
  try {
    const visita = await datos.leerVisita(id)
    if (!visita) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    if (!puedeVerVisita(user.profile.role as Role, user.id, visita)) {
      return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    }
    const eventos = await datos.eventosDeLaVisita(id)
    return NextResponse.json({ data: { ...visita, eventos, acciones: accionesDisponibles(visita, new Date()) } })
  } catch (e) {
    console.error('[GET /api/visits/[id]]', e)
    return NextResponse.json({ error: 'No pudimos cargar la visita' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { accionesDisponibles } from '@/lib/visitas/transiciones'
import { puedeVerVisita, accionesParaRol } from '@/lib/visitas/acceso'
import { encuestaParaFichaSegura } from '@/lib/visitas/encuesta/servicio'
import { mezclarEventos } from '@/lib/visitas/encuesta/ficha'
import type { Role } from '@/types/auth.types'

/** Ficha de la visita con su historial y las acciones posibles AHORA (calculadas con la hora del servidor). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
  try {
    const visita = await datos.leerVisita(id)
    if (!visita) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    if (!puedeVerVisita(role, user.id, visita)) {
      return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    }
    const eventos = await datos.eventosDeLaVisita(id)
    const encuesta = await encuestaParaFichaSegura(id, new Date())
    return NextResponse.json({
      data: { ...visita, eventos: mezclarEventos(eventos, encuesta?.eventos ?? []), acciones: accionesParaRol(accionesDisponibles(visita, new Date()), role), encuesta },
    })
  } catch (e) {
    console.error('[GET /api/visits/[id]]', e)
    return NextResponse.json({ error: 'No pudimos cargar la visita' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { advancePipelineState } from '@/lib/leads/pipeline-state'
import * as datos from '@/lib/visitas/datos'
import { aplicarAccion, accionesDisponibles, MOTIVOS_NO_REALIZADA, INTERESES, type AccionVisita } from '@/lib/visitas/transiciones'
import { puedeVerVisita, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/**
 * Cambia la etapa de una visita (spec §3.3). Reemplaza al PUT genérico y a
 * /complete, que solo pedían estar logueado: cualquiera —el abogado incluido—
 * podía cerrar cualquier visita. El historial lo escribe el trigger de la base.
 */
const accionSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('confirmar') }),
  z.object({ tipo: z.literal('reprogramar'), fecha: z.string().max(10), hora: z.string().max(5) }),
  z.object({ tipo: z.literal('cancelar'), motivo: z.enum(MOTIVOS_NO_REALIZADA), detalle: z.string().max(500).nullish() }),
  z.object({ tipo: z.literal('realizada'), interes: z.enum(INTERESES).nullish(), notas: z.string().max(1000).nullish() }),
  z.object({ tipo: z.literal('no_realizada'), motivo: z.enum(MOTIVOS_NO_REALIZADA), detalle: z.string().max(500).nullish() }),
  z.object({ tipo: z.literal('cambiar_asesor'), asesorId: z.string().uuid() }),
  z.object({ tipo: z.literal('reabrir'), motivo: z.string().max(500) }),
])

/**
 * `version` (el `updated_at` que vio la pantalla) NO es parte de `AccionVisita`
 * —ese tipo es puro, de `lib/visitas/transiciones.ts`, y no sabe nada de
 * concurrencia HTTP— así que se parsea APARTE, sobre el mismo JSON crudo. Un
 * objeto zod sin `version` simplemente la ignora cuando no viene, y al no
 * estar en modo `strict()` tampoco rechaza el resto del body por tener este
 * campo de más. Evita inflar las 7 variantes del discriminated union con un
 * campo que no cambia de significado entre ellas.
 */
const versionSchema = z.object({ version: z.string().max(40).optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  const bodyCrudo = await req.json().catch(() => null)
  const parsed = accionSchema.safeParse(bodyCrudo)
  if (!parsed.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  const accion = parsed.data as AccionVisita
  const versionPedida = versionSchema.safeParse(bodyCrudo).data?.version
  const { id } = await params
  // Un id que no es UUID haría fallar a Postgres con 22P02 (→ 500). Es "no existe".
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })

  try {
    const visita = await datos.leerVisita(id)
    if (!visita) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    if (!puedeVerVisita(role, user.id, visita)) return NextResponse.json({ error: 'No tenés permiso sobre esta visita' }, { status: 403 })
    if (accion.tipo === 'cambiar_asesor') {
      if (!puedeVerTodasLasVisitas(role)) return NextResponse.json({ error: 'No podés cambiar el asesor' }, { status: 403 })
      if (!(await datos.asesorAsignable(accion.asesorId))) return NextResponse.json({ error: 'Ese asesor no está activo' }, { status: 400 })
    }

    const ahora = new Date()
    const r = aplicarAccion(visita, accion, ahora)
    if (!r.ok) return NextResponse.json({ error: r.error, code: 'ACCION_NO_VALIDA' }, { status: 409 })

    const escrito = await datos.actualizarVisita(id, versionPedida ?? visita.updated_at, r.patch, user.id)
    if (!escrito.ok) {
      return NextResponse.json({ error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.', code: 'CAMBIO_CONCURRENTE' }, { status: 409 })
    }

    if (r.patch.status === 'completed' && visita.lead_id) {
      try { await advancePipelineState(visita.lead_id, 'visit_completed') } catch (e) { console.error('[visits/estado] avance falló', e) }
    }

    const actualizada = await datos.leerVisita(id)
    const eventos = await datos.eventosDeLaVisita(id)
    return NextResponse.json({ data: actualizada ? { ...actualizada, eventos, acciones: accionesDisponibles(actualizada, new Date()) } : null })
  } catch (e) {
    console.error('[POST /api/visits/[id]/estado]', e)
    return NextResponse.json({ error: 'No pudimos guardar el cambio. Probá de nuevo.' }, { status: 500 })
  }
}

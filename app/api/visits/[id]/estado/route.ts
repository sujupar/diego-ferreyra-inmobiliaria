import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { advancePipelineState } from '@/lib/leads/pipeline-state'
import { resolveLeadIdForVisitWithFallback } from '@/lib/leads/resolve-crm-visit-lead'
import * as datos from '@/lib/visitas/datos'
import { aplicarAccion, accionesDisponibles, MOTIVOS_NO_REALIZADA, INTERESES, type AccionVisita } from '@/lib/visitas/transiciones'
import { puedeVerVisita, puedeGestionarVisitas, puedeVerTodasLasVisitas, accionesParaRol } from '@/lib/visitas/acceso'
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
  // El interés es OBLIGATORIO (spec §3.3: "Se realizó" pide ¿Cómo viste el interés?).
  z.object({ tipo: z.literal('realizada'), interes: z.enum(INTERESES), notas: z.string().max(1000).nullish() }),
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
 *
 * `datetime({ offset: true })` acepta el formato REAL que devuelve PostgREST
 * para `timestamptz` (microsegundos + desfase `+00:00`, no solo `Z` con
 * milisegundos) — verificado contra `2099-01-01T00:00:00.000000+00:00`.
 */
const versionSchema = z.object({ version: z.string().datetime({ offset: true }).optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  // Corte temprano: un rol que no gestiona visitas (el abogado) ni se merece
  // que se lea la base por esto.
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso sobre esta visita' }, { status: 403 })

  const bodyCrudo = await req.json().catch(() => null)
  const parsed = accionSchema.safeParse(bodyCrudo)
  if (!parsed.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  const accion: AccionVisita = parsed.data

  const versionParsed = versionSchema.safeParse(bodyCrudo)
  if (!versionParsed.success) return NextResponse.json({ error: 'Versión inválida' }, { status: 400 })
  const versionPedida = versionParsed.data.version

  const { id } = await params
  // Un id que no es UUID haría fallar a Postgres con 22P02 (→ 500). Es "no existe".
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })

  try {
    const visita = await datos.leerVisita(id)
    if (!visita) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    // Visita ajena: 404, no 403 — no se le confirma a quien pregunta que la
    // fila EXISTE si no es suya ni puede ver todas.
    if (!puedeVerVisita(role, user.id, visita)) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })

    // Si la pantalla manda la versión que vio y ya no coincide con la que
    // ACABAMOS de leer, la visita cambió en el medio: cortar ACÁ, antes de
    // `aplicarAccion`, evita calcular un patch sobre un estado que el cliente
    // ni siquiera conoce. (El chequeo de `datos.actualizarVisita` más abajo
    // sigue estando: cubre la carrera DENTRO de este mismo request, entre
    // esta lectura y la escritura.)
    if (versionPedida !== undefined && versionPedida !== visita.updated_at) {
      return NextResponse.json({ error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.', code: 'CAMBIO_CONCURRENTE' }, { status: 409 })
    }

    if (accion.tipo === 'cambiar_asesor') {
      if (!puedeVerTodasLasVisitas(role)) return NextResponse.json({ error: 'No podés cambiar el asesor' }, { status: 403 })
      if (!(await datos.asesorAsignable(accion.asesorId))) return NextResponse.json({ error: 'Ese asesor no está activo' }, { status: 400 })
    }

    const ahora = new Date()
    const r = aplicarAccion(visita, accion, ahora)
    if (!r.ok) return NextResponse.json({ error: r.error, code: 'ACCION_NO_VALIDA' }, { status: 409 })

    const escrito = await datos.actualizarVisita(id, visita.updated_at, r.patch, user.id)
    if (!escrito.ok) {
      return NextResponse.json({ error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.', code: 'CAMBIO_CONCURRENTE' }, { status: 409 })
    }

    if (r.patch.status === 'completed') {
      try {
        // `visita.lead_id` es el vínculo directo (comprador creado desde la
        // ventana de agendar). Las visitas viejas, cargadas a mano desde el
        // CRM antes de que existiera esa columna, no lo tienen — para esas,
        // `resolveLeadIdForVisitWithFallback` intenta un match best-effort
        // por contacto (nunca lanza).
        const leadId = visita.lead_id ?? await resolveLeadIdForVisitWithFallback(id)
        if (leadId) await advancePipelineState(leadId, 'visit_completed')
      } catch (e) { console.error('[visits/estado] avance falló', e) }
    }

    // La escritura YA se hizo: si la relectura falla, no es un error del
    // cambio (que se guardó bien), así que no es un 500 — se informa con
    // `data: null` y quien llamó recarga la ficha.
    let actualizada: Awaited<ReturnType<typeof datos.leerVisita>> = null
    let eventos: Awaited<ReturnType<typeof datos.eventosDeLaVisita>> = []
    try {
      actualizada = await datos.leerVisita(id)
      eventos = await datos.eventosDeLaVisita(id)
    } catch (e) {
      console.error('[visits/estado] relectura falló', e)
      actualizada = null
    }
    return NextResponse.json({
      data: actualizada ? { ...actualizada, eventos, acciones: accionesParaRol(accionesDisponibles(actualizada, new Date()), role) } : null,
    })
  } catch (e) {
    console.error('[POST /api/visits/[id]/estado]', e)
    return NextResponse.json({ error: 'No pudimos guardar el cambio. Probá de nuevo.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { resolverAlcanceAsignado } from '@/lib/auth/scope'
import { listVisits } from '@/lib/supabase/visits'
import { advancePipelineState } from '@/lib/leads/pipeline-state'
import { sendVisitScheduledToClient } from '@/lib/email/notifications/visit-scheduled-client'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import * as datos from '@/lib/visitas/datos'
import { ORIGENES_VISITA, fuenteDelComprador, validarDetalleDeOrigen } from '@/lib/visitas/origen'
import { validarHorarioDeVisita, yaOcurrio } from '@/lib/visitas/horario'
import { validarPersonaNueva, telefonoCanonico, telefonoEfectivo } from '@/lib/visitas/persona'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas, asesorParaLaVisita } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/**
 * Alta de una visita desde la ventana "Agendar visita" (spec §3.2 y §4.4).
 * Todo se valida ACÁ (el navegador solo ayuda): permisos, origen, persona,
 * horario argentino, propiedad disponible y duplicado. La persona queda SIEMPRE
 * vinculada a un registro de comprador (`property_leads`).
 */
const personaSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('consulta'), id: z.string().uuid(), telefono: z.string().max(40).optional() }),
  z.object({ tipo: z.literal('registro'), id: z.string().uuid(), telefono: z.string().max(40).optional() }),
  z.object({ tipo: z.literal('nueva'), nombre: z.string().max(200), telefono: z.string().max(40), email: z.string().max(200).nullish() }),
])

const altaSchema = z.object({
  propiedadId: z.string().uuid(),
  origen: z.enum(ORIGENES_VISITA),
  origenDetalle: z.string().max(500).nullish(),
  persona: personaSchema,
  fecha: z.string().max(10),
  hora: z.string().max(5),
  asesorId: z.string().uuid().nullish(),
  confirmada: z.boolean(),
  notas: z.string().max(1000).nullish(),
  forzarDuplicado: z.boolean().optional(),
})

function error(status: number, mensaje: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: mensaje, ...extra }, { status })
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return error(403, 'No tenés permiso para agendar visitas')

  const parsed = altaSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return error(400, 'Faltan datos de la visita')
  const b = parsed.data

  const horario = validarHorarioDeVisita(b.fecha, b.hora)
  if (!horario.ok) return error(400, horario.error)

  const asesor = asesorParaLaVisita(role, user.id, b.asesorId)
  if (!asesor.ok) return error(400, asesor.error)

  try {
    const propiedad = await datos.leerPropiedadParaVisita(b.propiedadId)
    if (!propiedad) return error(404, 'No encontramos la propiedad')
    if (!puedeVerTodasLasVisitas(role) && propiedad.assigned_to !== user.id) {
      return error(403, 'Solo podés agendar visitas en tus propiedades')
    }
    if (propiedad.status !== 'approved' || !['disponible', 'reservada'].includes(propiedad.commercial_status ?? 'disponible')) {
      return error(409, 'La propiedad no está disponible para visitas', { code: 'PROPIEDAD_NO_DISPONIBLE' })
    }
    // Ronda 1 de revisión (Tarea 8): si el rol puede ver TODAS las visitas, se
    // valida SIEMPRE que el asesor sea asignable — incluso cuando se elige a sí
    // mismo (un coordinador recién dado de baja como asesor igual puede seguir
    // operando el CRM un rato; que la propia sesión siga activa no prueba que
    // la cuenta todavía sea "asesor o dueño"). Para el rol asesor no hace falta
    // la consulta: `asesorParaLaVisita` ya lo fuerza a sí mismo siempre.
    if (puedeVerTodasLasVisitas(role) && !(await datos.asesorAsignable(asesor.asesorId))) {
      return error(400, 'Esa persona no puede mostrar propiedades (tiene que ser asesor o dueño activo)')
    }

    // ── Detalle del origen (M1, ronda 1) ─────────────────────────────────────
    // Para los orígenes que NO son "portal" se valida ACÁ, antes de tocar la
    // persona: así "otro" sin escribir el detalle no llega a crear ni a
    // actualizar un comprador a mitad de camino. Para "portal" el detalle ES
    // el portal de la consulta —nunca puede fallar, `validarDetalleDeOrigen`
    // siempre da ok para ese origen— y se resuelve más abajo, apenas se lee
    // la consulta.
    let origenDetalle: string | null = null
    if (b.origen !== 'portal') {
      const d = validarDetalleDeOrigen(b.origen, b.origenDetalle, null)
      if (!d.ok) return error(400, d.error)
      origenDetalle = d.detalle
    }

    // ── La persona ─────────────────────────────────────────────────────────
    let nombre: string
    let telefono: string
    let email: string | null = null
    let leadId: string
    let portalInquiryId: string | null = null

    if (b.persona.tipo === 'consulta') {
      if (b.origen !== 'portal') return error(400, 'Una consulta de portal solo va con el origen "Consulta de portal"')
      const c = await datos.leerConsulta(b.persona.id)
      if (!c || c.property_id !== propiedad.id) return error(400, 'Esa consulta no es de esta propiedad')
      // El teléfono GUARDADO manda si ya es válido: lo que mandó el navegador
      // es apenas una sugerencia (lib/visitas/persona.ts, telefonoEfectivo).
      const telCrudo = telefonoEfectivo(c.lead_phone, b.persona.telefono)
      if (!ultimos10Digitos(telCrudo)) return error(400, 'Falta el teléfono de la persona')
      // Teléfono canónico (lib/visitas/persona.ts): así "11 5823-4521" y
      // "011 15 5823-4521" —el mismo celular, escrito distinto— quedan
      // guardados IDÉNTICOS en client_phone y en property_leads.phone.
      const tel = telefonoCanonico(telCrudo)
      const d = validarDetalleDeOrigen(b.origen, b.origenDetalle, c.portal)
      if (!d.ok) return error(400, d.error) // defensivo: origen==='portal' siempre da ok (ver origen.ts)
      origenDetalle = d.detalle
      nombre = c.lead_name?.trim() || 'Sin nombre'
      telefono = tel
      email = c.lead_email?.trim().toLowerCase() || null
      portalInquiryId = c.id
      leadId = await datos.asegurarComprador({
        propertyId: propiedad.id, nombre, telefono, email, mensaje: c.lead_message,
        source: fuenteDelComprador('portal', c.portal), asignadoA: propiedad.assigned_to,
      })
    } else if (b.persona.tipo === 'registro') {
      const r = await datos.leerRegistro(b.persona.id)
      if (!r || r.property_id !== propiedad.id || r.deleted_at) return error(400, 'Esa persona no está registrada en esta propiedad')
      const telCrudo = telefonoEfectivo(r.phone, b.persona.telefono)
      if (!ultimos10Digitos(telCrudo)) return error(400, 'Falta el teléfono de la persona')
      const tel = telefonoCanonico(telCrudo)
      if (!ultimos10Digitos(r.phone)) await datos.completarTelefonoDelRegistro(r.id, tel)
      nombre = r.name?.trim() || 'Sin nombre'
      telefono = tel
      email = r.email?.trim().toLowerCase() || null
      leadId = r.id
    } else {
      const p = validarPersonaNueva(b.persona)
      if (!p.ok) return error(400, p.errores[0], { errores: p.errores })
      nombre = p.valor.nombre
      telefono = telefonoCanonico(p.valor.telefono)
      email = p.valor.email
      leadId = await datos.asegurarComprador({
        propertyId: propiedad.id, nombre, telefono, email, mensaje: null,
        source: fuenteDelComprador(b.origen), asignadoA: propiedad.assigned_to,
      })
    }

    // ── Duplicado: misma persona con una visita viva en esta propiedad ──────
    // Lo de arriba YA pudo escribir en property_leads (comprador reutilizado,
    // o un hueco de teléfono/email completado) aunque la visita termine en 409
    // acá abajo — aceptado a propósito: ese dato queda correcto igual, y sirve
    // la próxima vez que esta persona agende (no hace falta deshacerlo).
    if (!b.forzarDuplicado) {
      const norm = ultimos10Digitos(telefono)
      const activa = (await datos.visitasActivasDeLaPropiedad(propiedad.id))
        .find(v => v.lead_id === leadId
          || (norm !== null && ultimos10Digitos(telefonoCanonico(v.client_phone ?? '')) === norm))
      if (activa) {
        return error(409, 'Esta persona ya tiene una visita agendada en esta propiedad', {
          code: 'VISITA_DUPLICADA', visita: { id: activa.id, scheduled_at: activa.scheduled_at },
        })
      }
    }

    const visitaId = await datos.insertarVisita({
      property_id: propiedad.id, advisor_id: asesor.asesorId, client_name: nombre, client_email: email,
      client_phone: telefono, scheduled_at: horario.instante.toISOString(),
      status: b.confirmada ? 'scheduled' : 'pending_confirmation',
      notes: b.notas?.trim() || null, origin: b.origen, origin_detail: origenDetalle,
      lead_id: leadId, portal_inquiry_id: portalInquiryId, created_by: user.id, changed_by: user.id,
    })

    // Lo de abajo es secundario: la visita YA está. Un fallo acá se registra y
    // no hace parecer que no se agendó.
    try { await advancePipelineState(leadId, 'visit_scheduled') } catch (e) { console.error('[visits] avance del comprador falló', e) }
    // Solo si la visita es FUTURA: la ventana deja registrar visitas de hasta 60 días
    // atrás con "Sí, confirmada" marcado por defecto, y registrar hoy la visita de ayer le
    // mandaría a un cliente real "te confirmamos la cita del jueves".
    if (b.confirmada && email && !yaOcurrio(horario.instante, new Date())) {
      try { await sendVisitScheduledToClient(visitaId) } catch (e) { console.error('[visits] email de confirmación falló', e) }
    }
    return NextResponse.json({ data: { id: visitaId } }, { status: 201 })
  } catch (e) {
    console.error('[POST /api/visits]', e)
    return error(500, 'No pudimos agendar la visita. Probá de nuevo.')
  }
}

/** Lista (la pantalla /visits se rehace en la Entrega 2; acá solo se cierran permisos y alcance). */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return error(403, 'No tenés permiso para ver visitas')
  const sp = req.nextUrl.searchParams
  try {
    const visits = await listVisits({
      advisorId: resolverAlcanceAsignado(role, user.id, sp.get('advisor_id')),
      propertyId: sp.get('property_id') || undefined,
      status: sp.get('status') || undefined,
      from: sp.get('from') || undefined,
      to: sp.get('to') || undefined,
    })
    return NextResponse.json({ data: visits })
  } catch (e) {
    console.error('[GET /api/visits]', e)
    return error(500, 'No pudimos cargar las visitas')
  }
}

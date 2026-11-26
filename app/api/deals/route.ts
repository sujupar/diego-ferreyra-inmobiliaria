import { NextRequest, NextResponse } from 'next/server'
import {
  convertirSolicitud,
  createDeal,
  getDeals,
  leerProcesoParaConvertir,
  syncMailchimpBestEffort,
  type CamposConversion,
} from '@/lib/supabase/deals'
import { guardarDatosDeContacto, hayOtroContactoCon } from '@/lib/supabase/contactos'
import { hasPermission } from '@/lib/auth/roles'
import { motivoNoConvertir } from '@/lib/crm/deal-activo'
import type { UserWithProfile } from '@/types/auth.types'
import { createTask } from '@/lib/supabase/tasks'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, requirePermission } from '@/lib/auth/require-role'
import { resolverAlcanceAsignado } from '@/lib/auth/scope'
import { notifyDealCreated } from '@/lib/email/notifications/deal-created'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { validarDatosCliente, puedeReasignarAsesor } from '@/lib/deals/proceso-manual'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')
    // El alcance NO se decide en el navegador: quien no tiene `pipeline.view_all`
    // queda forzado a sus propios deals, se ignore lo que venga en la dirección.
    const assignedTo = resolverAlcanceAsignado(
      user.profile.role,
      user.profile.id || user.id,
      searchParams.get('assigned_to'),
    )
    const { data, total, stageCounts, crmStageCounts } = await getDeals({
      stage: searchParams.get('stage') || undefined,
      crm_stage: searchParams.get('crm_stage') || undefined,
      origin: searchParams.get('origin') || undefined,
      assigned_to: assignedTo,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
      offset: offsetParam ? parseInt(offsetParam, 10) : undefined,
    })

    // Get advisor names. `getDeals` no tiene tipos de la base: se declara acá lo único
    // que se lee de cada fila (el resto viaja tal cual).
    type FilaListado = Record<string, unknown> & {
      assigned_to: string | null
      contacts?: { full_name?: string | null; phone?: string | null; email?: string | null } | null
    }
    const filas = data as unknown as FilaListado[]
    const assignedIds = [...new Set(filas.map((d) => d.assigned_to).filter((x): x is string => !!x))]
    const profileMap: Record<string, string> = {}
    if (assignedIds.length > 0) {
      const { data: profiles } = await getAdmin().from('profiles').select('id, full_name').in('id', assignedIds)
      for (const p of profiles || []) profileMap[p.id] = p.full_name
    }

    const enriched = filas.map((d) => ({
      ...d,
      contact_name: d.contacts?.full_name || '',
      contact_phone: d.contacts?.phone || '',
      contact_email: d.contacts?.email || '',
      assigned_to_name: d.assigned_to ? profileMap[d.assigned_to] || '' : '',
    }))

    return NextResponse.json({ data: enriched, total, stageCounts, crmStageCounts })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('pipeline.schedule')
    const body = await request.json()
    const { contact_name, contact_phone, contact_email, property_address, scheduled_date, scheduled_time, origin, assigned_to, notes, property_type, property_type_other, neighborhood, rooms, covered_area } = body

    // Coordinar desde la ficha (crm-ficha-y-llamadas, D9). Sin ninguno de los dos, todo
    // lo que sigue es exactamente lo de siempre.
    const fromDealId = textoNoVacio(body.from_deal_id)
    const contactIdPedido = textoNoVacio(body.contact_id)
    if (fromDealId && contactIdPedido) {
      return NextResponse.json({ error: 'Mandá el proceso o el contacto, no los dos' }, { status: 400 })
    }
    // Una conversión sin día dejaría el proceso en `scheduled` sin fecha: el CRM lo
    // seguiría mostrando como Solicitud y el email saldría con la fecha vacía (D9, paso 1).
    if (fromDealId && !esDiaValido(scheduled_date)) {
      return NextResponse.json({ error: 'Elegí el día de la tasación' }, { status: 400 })
    }

    if (!contact_name || !property_address) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }
    if (!property_type || !['departamento','casa','ph','otro'].includes(property_type)) {
      return NextResponse.json({ error: 'property_type inválido' }, { status: 400 })
    }
    if (property_type === 'otro' && !property_type_other?.trim()) {
      return NextResponse.json({ error: 'property_type_other requerido' }, { status: 400 })
    }
    if (!neighborhood?.trim()) return NextResponse.json({ error: 'neighborhood requerido' }, { status: 400 })
    if (!rooms || rooms < 1) return NextResponse.json({ error: 'rooms requerido' }, { status: 400 })

    // DATOS DEL CLIENTE OBLIGATORIOS (2026-09-18). Esta ruta solo exigía nombre
    // y dirección: teléfono, email y asesor eran opcionales, y por acá nacieron
    // procesos que nadie podía llamar ni veía en su CRM. Exige lo mismo que la
    // tasación manual (`validarDatosCliente`), y un asesor coordina a SU nombre:
    // un proceso asignado a otro le desaparecería apenas lo crea.
    const cliente = validarDatosCliente({ nombre: contact_name, telefono: contact_phone, email: contact_email }, property_address)
    const asesorId = puedeReasignarAsesor(user.profile.role)
      ? (typeof assigned_to === 'string' ? assigned_to.trim() : '')
      : (user.profile.id || user.id)
    const errores = [
      ...(cliente.ok ? [] : cliente.errores),
      ...(asesorId ? [] : ['Elegí el asesor: sin asesor el proceso no le aparece en su CRM.']),
    ]
    if (!cliente.ok || errores.length > 0) {
      return NextResponse.json({ error: errores.join(' '), errores }, { status: 400 })
    }
    const { nombre: nombreCliente, telefono: telefonoCliente, email: emailCliente } = cliente.valor

    if (fromDealId) {
      return await convertirDesdeSolicitud({
        user,
        dealId: fromDealId,
        asesorId,
        cliente: { nombre: nombreCliente, telefono: telefonoCliente, email: emailCliente },
        emailTipeado: String(contact_email ?? ''),
        campos: {
          scheduled_date: String(scheduled_date),
          scheduled_time: scheduled_time || null,
          assigned_to: asesorId,
          property_address,
          property_type,
          property_type_other: property_type === 'otro' ? property_type_other : null,
          neighborhood,
          rooms: typeof rooms === 'number' ? rooms : parseInt(rooms, 10),
          covered_area: covered_area != null && covered_area !== '' ? Number(covered_area) : null,
        },
        notasNuevas: typeof notes === 'string' ? notes : '',
      })
    }

    const supabase = getAdmin()

    // Create or find contact — dedupe by email first, then phone. The original
    // bug surfaced this gap: when only phone was provided, every coordinar
    // produced a brand-new contact, leaving the contacts table littered.
    let contactId: string | null = null
    {
      // Se busca con el email tal cual lo tipearon Y en minúsculas: los viejos
      // pueden estar guardados con mayúsculas y no hay que duplicarlos.
      const variantes = [...new Set([String(contact_email).trim(), emailCliente])]
      const { data: existing } = await supabase.from('contacts').select('id').in('email', variantes).limit(1).maybeSingle()
      if (existing) contactId = existing.id
    }
    if (!contactId) {
      // Por últimos 10 dígitos (`phone_norm`), no por igualdad exacta: el
      // coordinador tipea el teléfono a mano libre ("11 4937-2737") y el
      // contacto puede estar guardado como '+549...' o '+54...'. La igualdad
      // exacta creaba un contacto NUEVO por cada formato distinto — es el
      // mismo bug del '9' argentino que dejó mudo al agente el 2026-08-15.
      const clave = ultimos10Digitos(telefonoCliente)
      const { data: existing } = clave
        ? await supabase.from('contacts').select('id').eq('phone_norm', clave)
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
        : await supabase.from('contacts').select('id').eq('phone', telefonoCliente).maybeSingle()
      if (existing) contactId = existing.id
    }

    if (!contactId) {
      const { data: newContact, error: cErr } = await supabase
        .from('contacts')
        .insert({ full_name: nombreCliente, phone: telefonoCliente, email: emailCliente, origin: origin || null, assigned_to: asesorId })
        .select('id').single()
      if (cErr) throw cErr
      contactId = newContact.id
    }

    if (!contactId) throw new Error('No se pudo crear/encontrar el contacto')

    // Create deal. created_by persists who coordinated so notifyDealCreated
    // can resolve the coordinador later even if the cookie session changes.
    const dealId = await createDeal({
      contact_id: contactId,
      property_address,
      scheduled_date: scheduled_date || null,
      scheduled_time: scheduled_time || null,
      origin: origin || null,
      assigned_to: asesorId,
      created_by: user.id,
      notes: notes || null,
      property_type,
      property_type_other: property_type === 'otro' ? property_type_other : null,
      neighborhood,
      rooms: typeof rooms === 'number' ? rooms : parseInt(rooms, 10),
      covered_area: covered_area != null && covered_area !== '' ? Number(covered_area) : null,
    })

    // Auto-create tasks
    if (asesorId) {
      try {
        // Task for asesor: new assignment
        await createTask({
          type: 'new_assignment',
          title: `Tasación coordinada: ${property_address}`,
          description: `Contacto: ${nombreCliente}. ${scheduled_date ? 'Fecha: ' + scheduled_date : ''}`,
          assigned_to: asesorId,
          deal_id: dealId,
          contact_id: contactId,
        })
      } catch (err) {
        console.error('Failed to create task:', err)
        // Don't fail the whole request if task creation fails
      }
    }

    // N1: notificar al asesor asignado y a admins+dueños.
    // Si el envío falla, escala a admins via notifyAdminEmailFailure.
    await notifyWithEscalation(
      () => notifyDealCreated({ dealId }),
      { failedNotificationType: 'deal_created', entityType: 'deal', entityId: dealId },
    )

    return NextResponse.json({ success: true, id: dealId, contact_id: contactId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Coordinar desde la ficha (crm-ficha-y-llamadas, design.md D9)
// ---------------------------------------------------------------------------

const YA_CAMBIO_DE_ETAPA = 'El proceso ya cambió de etapa'
const AVISO_CONTACTO_NO_GUARDADO =
  'La tasación quedó coordinada, pero no se pudieron guardar los datos corregidos de la persona.'
const AVISO_OTRO_CONTACTO = 'Ya hay otro contacto con ese email o teléfono: revisá si es la misma persona.'

function textoNoVacio(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

/** `YYYY-MM-DD` y un día que existe (2026-02-30 no). */
function esDiaValido(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const d = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor
}

/**
 * Las notas de una solicitud las leen otros (el mensaje de la persona, lo que anota el
 * agente de WhatsApp, el "Stage GHL" del Panel de negocio): nunca se pisan. Campo vacío
 * → no se escribe la columna; con texto → se agrega debajo de lo que había (D9, paso 4).
 */
function notasParaConvertir(previas: string | null, nuevas: string): string | undefined {
  const texto = nuevas.trim()
  if (!texto) return undefined
  return previas?.trim() ? `${previas}\n\n${texto}` : texto
}

/**
 * Después de coordinar, guarda en el contacto los datos validados del formulario (D9,
 * paso 5). Nunca corta la coordinación: un fallo (con un reintento) o un email/teléfono
 * que ya tiene otra persona vuelven como avisos.
 */
async function actualizarContactoCoordinado(
  contactId: string,
  cliente: { nombre: string; telefono: string; email: string },
  emailTipeado: string,
): Promise<string[]> {
  const avisos: string[] = []
  const datos = { full_name: cliente.nombre, phone: cliente.telefono, email: cliente.email }
  let guardado = false
  for (let intento = 1; intento <= 2 && !guardado; intento++) {
    try {
      await guardarDatosDeContacto(contactId, datos)
      guardado = true
    } catch (error) {
      console.error('POST /api/deals: no se pudo guardar el contacto al coordinar', { contactId, intento, error })
    }
  }
  if (!guardado) avisos.push(AVISO_CONTACTO_NO_GUARDADO)
  try {
    if (await hayOtroContactoCon(contactId, { emails: [emailTipeado, cliente.email], telefono: cliente.telefono })) {
      avisos.push(AVISO_OTRO_CONTACTO)
    }
  } catch (error) {
    // El aviso es una ayuda, no una condición: si no se pudo mirar, se coordina igual.
    console.error('POST /api/deals: no se pudo buscar otro contacto con esos datos', { contactId, error })
  }
  return avisos
}

/**
 * Convierte la solicitud `dealId` en tasación coordinada, sin crear otro proceso. El
 * contacto es SIEMPRE el del proceso: no se busca por email ni por teléfono, así
 * corregir el email en el formulario no puede llevarse a otra persona (D9, paso 3).
 */
async function convertirDesdeSolicitud(p: {
  user: UserWithProfile
  dealId: string
  asesorId: string
  cliente: { nombre: string; telefono: string; email: string }
  emailTipeado: string
  campos: Omit<CamposConversion, 'notes' | 'created_by'>
  notasNuevas: string
}) {
  const proceso = await leerProcesoParaConvertir(p.dealId)
  const role = p.user.profile.role
  // Primero el permiso y después la etapa (D9, paso 2): si no, un asesor sabría, por la
  // diferencia entre 404 y 409, algo de un proceso que no es suyo.
  const motivo = proceso
    ? motivoNoConvertir(
        {
          id: p.user.profile.id || p.user.id,
          puedeVerTodos: hasPermission(role, 'pipeline.view_all'),
          puedeCoordinar: hasPermission(role, 'pipeline.schedule'),
        },
        proceso,
      )
    : 'sin_permiso'
  if (!proceso || motivo === 'sin_permiso') {
    return NextResponse.json({ error: 'No encontramos este proceso' }, { status: 404 })
  }
  if (motivo === 'clase_gratuita') {
    // `notifyDealCreated` tira con ese origen: el lead de la clase se coordina con
    // `contact_id`, como un proceso nuevo.
    return NextResponse.json(
      { error: 'Este proceso viene de la clase gratuita: se coordina como un proceso nuevo' },
      { status: 409 },
    )
  }
  if (!proceso.contact_id) {
    return NextResponse.json(
      { error: 'Este proceso no tiene una persona vinculada: vinculala desde el proceso antes de coordinar' },
      { status: 409 },
    )
  }
  if (motivo === 'ya_cambio_de_etapa') return NextResponse.json({ error: YA_CAMBIO_DE_ETAPA }, { status: 409 })
  const contactId = proceso.contact_id

  const campos: CamposConversion = { ...p.campos }
  const notas = notasParaConvertir(proceso.notes, p.notasNuevas)
  if (notas !== undefined) campos.notes = notas
  // `notifyDealCreated` toma a la coordinadora de `created_by`: se completa solo si
  // estaba vacío (los procesos del embudo nacen así).
  if (!proceso.created_by) campos.created_by = p.user.id

  // Primero el proceso. Si no cambió ninguna fila (otro lo movió en el medio), no se
  // toca nada más: tampoco el contacto.
  if (!(await convertirSolicitud(p.dealId, campos))) {
    return NextResponse.json({ error: YA_CAMBIO_DE_ETAPA }, { status: 409 })
  }
  const avisos = await actualizarContactoCoordinado(contactId, p.cliente, p.emailTipeado)

  // Efectos, en este orden fijo: lo que le sirve al equipo primero; Mailchimp al final y
  // DESPUÉS del contacto, porque busca a la persona por su email (D9, paso 6).
  try {
    await createTask({
      type: 'new_assignment',
      title: `Tasación coordinada: ${p.campos.property_address}`,
      description: `Contacto: ${p.cliente.nombre}. Fecha: ${p.campos.scheduled_date}`,
      assigned_to: p.asesorId,
      deal_id: p.dealId,
      contact_id: contactId,
    })
  } catch (err) {
    console.error('POST /api/deals (conversión): no se pudo crear la tarea', { dealId: p.dealId, err })
  }
  await notifyWithEscalation(
    () => notifyDealCreated({ dealId: p.dealId }),
    { failedNotificationType: 'deal_created', entityType: 'deal', entityId: p.dealId },
  )
  try {
    await syncMailchimpBestEffort(p.dealId)
  } catch (err) {
    // `syncMailchimpBestEffort` ya atrapa sus errores; esto es por si eso cambia.
    console.error('POST /api/deals (conversión): falló la sincronización de Mailchimp', { dealId: p.dealId, err })
  }

  return NextResponse.json({
    success: true,
    id: p.dealId,
    contact_id: contactId,
    ...(avisos.length > 0 ? { warning: avisos.join(' ') } : {}),
  })
}

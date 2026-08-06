/**
 * EL DISPARADOR: contesta una consulta de portal por WhatsApp, al instante.
 *
 * Alguien dejó una consulta en ZonaProp o Argenprop. Nunca nos escribió, así
 * que no hay ventana de 24hs: solo se le puede mandar una plantilla aprobada.
 * Esta función elige cuál según el material de la propiedad, la manda con el
 * archivo en el encabezado, y deja al lead creado para que el agente sepa
 * después de qué propiedad se está hablando.
 *
 * NUNCA LANZA. Una consulta mal contestada no puede romper la ingesta de
 * consultas: si algo falla, la consulta queda registrada igual y el motivo
 * queda escrito para que el equipo lo vea.
 *
 * Los frenos viven en `decidirEnvio` (función pura, testeada aparte): el
 * interruptor, el modo prueba, la idempotencia, y el más importante — sin saber
 * por qué propiedad pregunta, no se le escribe nada.
 */
import { createClient } from '@supabase/supabase-js'
import { sendWhatsappTemplate } from '@/lib/integrations/whatsapp/meta-cloud'
import { decidirEnvio, type AjustesEnvio } from '@/lib/leads/consulta-envio'
import {
  elegirPlantilla,
  parametrosDelCuerpo,
  PLANTILLAS_UTIL,
  type EleccionPlantilla,
} from '@/lib/leads/consulta-template'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const COLUMNAS_PROPIEDAD = 'id, address, title, neighborhood, city, property_type, photos, plans, video_file_url, assigned_to'

export interface RespuestaConsulta {
  enviado: boolean
  motivo: string
  /** `true` = el equipo tiene que hacer algo con esta consulta a mano. */
  requiereAtencion?: boolean
  plantillaUsada?: string
}

interface PropiedadParaConsulta {
  id: string
  address: string | null
  title: string | null
  neighborhood: string | null
  property_type: string | null
  photos: string[] | null
  plans: string[] | null
  video_file_url: string | null
  assigned_to: string | null
}

/** "la casa de Entre Ríos 2333, Martínez" — como lo diría una persona. */
function nombrarPropiedad(p: PropiedadParaConsulta): string {
  const tipo = (p.property_type ?? '').toLowerCase()
  const articulo = tipo.startsWith('casa') ? 'la casa' : tipo ? `el ${tipo}` : 'la propiedad'
  const donde = [p.address, p.neighborhood].filter(Boolean).join(', ')
  return donde ? `${articulo} de ${donde}` : (p.title ?? 'la propiedad')
}

/**
 * Qué plantilla se manda de verdad.
 *
 * Hay DOS familias aprobadas: la de trámite (`_util`, mejor entregabilidad) y
 * la cálida (que Meta reclasificó como marketing). Se intenta la de trámite y,
 * SOLO si Meta dice que no existe o no está aprobada, se cae a la cálida. Es el
 * mismo patrón que el downgrade de tier al publicar en MercadoLibre: intentar
 * lo mejor, aceptar lo que haya, y no quedarse sin mandar nada.
 *
 * El match del error es ESTRECHO a propósito: ensancharlo se tragaría fallas
 * reales (un teléfono inválido, la cuenta sin saldo) y las haría ver como un
 * problema de plantilla.
 */
function esPlantillaNoDisponible(error: string | undefined): boolean {
  const e = (error ?? '').toLowerCase()
  return e.includes('template name does not exist') || e.includes('template not found') || e.includes('does not exist in the translation')
}

export async function responderConsulta(inquiryId: string): Promise<RespuestaConsulta> {
  try {
    const sb = admin()

    const { data: consulta, error: errConsulta } = await sb
      .from('portal_inquiries')
      .select('id, lead_name, lead_phone, lead_email, lead_message, property_id, whatsapp_enviado_at, portal')
      .eq('id', inquiryId)
      .maybeSingle()
    if (errConsulta || !consulta) {
      return { enviado: false, motivo: 'no se pudo leer la consulta' }
    }
    const c = consulta as {
      id: string; lead_name: string | null; lead_phone: string | null; lead_email: string | null
      lead_message: string | null; property_id: string | null; whatsapp_enviado_at: string | null; portal: string
    }

    const { data: ajustesRow } = await sb
      .from('ai_agent_settings')
      .select('consulta_respuesta_enabled, consulta_test_phones')
      .eq('id', true)
      .maybeSingle()
    const ajustes = (ajustesRow as AjustesEnvio | null) ?? null

    const decision = decidirEnvio(c, ajustes)
    if (!decision.enviar) {
      return { enviado: false, motivo: decision.motivo, requiereAtencion: decision.visibleParaElEquipo }
    }

    const { data: propRow, error: errProp } = await sb
      .from('properties').select(COLUMNAS_PROPIEDAD).eq('id', c.property_id!).maybeSingle()
    if (errProp || !propRow) {
      return { enviado: false, motivo: 'la propiedad vinculada no existe', requiereAtencion: true }
    }
    const prop = propRow as PropiedadParaConsulta

    const eleccion: EleccionPlantilla = elegirPlantilla(prop)
    const nombre = c.lead_name?.trim() || ''
    const params = parametrosDelCuerpo(eleccion, { nombre, propiedad: nombrarPropiedad(prop) })

    // El lead se crea ANTES de mandar: si el WhatsApp sale y el lead no existe,
    // la respuesta del cliente llega a una conversación sin propiedad y el
    // agente no sabe de qué le hablan. Al revés no molesta a nadie.
    const leadId = await asegurarLead(sb, c, prop)

    const enviar = async (plantilla: string) =>
      sendWhatsappTemplate({
        to: decision.telefono,
        templateName: plantilla,
        languageCode: process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_AR',
        bodyParams: params,
        headerMedia: eleccion.header
          ? { type: eleccion.header.tipo, link: eleccion.header.link }
          : undefined,
        leadId,
        propertyId: prop.id,
        origen: 'consulta_portal',
        timeoutMs: 8000,
      })

    const preferida = PLANTILLAS_UTIL[eleccion.plantilla]
    let res = await enviar(preferida)
    let usada = preferida
    if (!res.ok && esPlantillaNoDisponible(res.error)) {
      console.warn(`[consulta] ${preferida} no está disponible todavía, se usa ${eleccion.plantilla}`)
      usada = eleccion.plantilla
      res = await enviar(usada)
    }

    if (!res.ok) {
      return { enviado: false, motivo: `no se pudo enviar: ${res.error ?? 'error de Meta'}`, requiereAtencion: true }
    }
    if (res.skipped) {
      return { enviado: false, motivo: 'modo prueba de WhatsApp: no se mandó nada', requiereAtencion: false }
    }

    await sb.from('portal_inquiries').update({ whatsapp_enviado_at: new Date().toISOString() }).eq('id', c.id)
    return { enviado: true, motivo: 'enviado', plantillaUsada: usada }
  } catch (err) {
    console.error('[consulta] excepción al responder (la consulta queda igual):', err)
    return { enviado: false, motivo: 'excepción interna', requiereAtencion: true }
  }
}

/**
 * El lead de esta persona para esta propiedad. Si ya existe (consultó dos veces,
 * o vino por otro lado), se reusa: dos leads del mismo teléfono para la misma
 * propiedad ensucian el CRM y confunden al agente.
 */
async function asegurarLead(
  sb: ReturnType<typeof admin>,
  c: { lead_name: string | null; lead_phone: string | null; lead_email: string | null; lead_message: string | null; portal: string },
  prop: PropiedadParaConsulta,
): Promise<string | null> {
  try {
    const { data: existente } = await sb
      .from('property_leads')
      .select('id')
      .eq('property_id', prop.id)
      .eq('phone', c.lead_phone)
      .is('deleted_at', null)
      .limit(1)
    const yaEsta = (existente as Array<{ id: string }> | null)?.[0]
    if (yaEsta) return yaEsta.id

    const { data: creado, error } = await sb
      .from('property_leads')
      .insert({
        property_id: prop.id,
        name: c.lead_name?.trim() || 'Consulta de portal',
        phone: c.lead_phone,
        email: c.lead_email,
        message: c.lead_message,
        source: `portal:${c.portal}`,
        assigned_to: prop.assigned_to,
      })
      .select('id')
      .single()
    if (error) {
      console.warn('[consulta] no se pudo crear el lead (se manda igual):', error.message)
      return null
    }
    return (creado as { id: string }).id
  } catch (err) {
    console.warn('[consulta] excepción creando el lead (se manda igual):', err)
    return null
  }
}

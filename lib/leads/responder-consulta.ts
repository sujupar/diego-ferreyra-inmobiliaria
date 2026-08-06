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
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { decidirEnvio, type AjustesEnvio, type Normalizador } from '@/lib/leads/consulta-envio'
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
 * Qué plantilla se manda, y qué pasa cuando Meta no la entrega.
 *
 * Hay DOS familias aprobadas y suenan MUY distinto:
 *   - la CÁLIDA ("Hola, ¿cómo estás?… contame, ¿cómo te puedo ayudar?"), que
 *     Meta clasificó como MARKETING;
 *   - la de TRÁMITE (`_util`, "Recibimos tu consulta. Te adjuntamos…"), UTILITY.
 *
 * Decisión del dueño (2026-08-06): se manda la CÁLIDA, porque es la que suena a
 * Diego y la que hace que la gente conteste. La de trámite queda de RED, para
 * cuando Meta decide no entregar la de marketing.
 *
 * ## Qué pasa cuando Meta no entrega una de marketing
 *
 * Y esta es la parte que importa: NO es silencioso. Meta lo dice en el momento
 * del envío, con un código, y en ese caso NO se cobra el mensaje:
 *   - 131049 — "no la entregamos para cuidar la calidad del ecosistema": el
 *     límite de marketing de ESA persona (cuántos mensajes promocionales recibe
 *     por período, de todas las empresas juntas).
 *   - 131050 — esa persona desactivó los mensajes de marketing.
 *
 * O sea: no hay forma de pagar por un mensaje que no llegó. Lo que sí puede
 * pasar es perder el contacto — y por eso, ante cualquiera de los dos, se
 * reintenta con la de TRÁMITE. Esa es legítima: es la respuesta a un trámite que
 * la persona inició (dejó una consulta), no publicidad, y por eso se entrega
 * igual a quien bloqueó las promociones.
 *
 * Si ni esa entra, la consulta queda marcada para que una persona la atienda.
 */
const META_MARKETING_BLOQUEADO = new Set([131049, 131050])

function esPlantillaNoDisponible(error: string | undefined): boolean {
  const e = (error ?? '').toLowerCase()
  return e.includes('template name does not exist') || e.includes('template not found') || e.includes('does not exist in the translation')
}

/**
 * `normalizar` existe como costura para poder disparar esto desde un script
 * suelto (`scripts/probar-consulta.ts`): la librería de teléfonos carga su build
 * CJS fuera de Next y explota al usarla. En la app real no se pasa nunca — se
 * usa el normalizador de siempre.
 */
export async function responderConsulta(
  inquiryId: string,
  opciones?: { normalizar?: Normalizador },
): Promise<RespuestaConsulta> {
  try {
    const sb = admin()

    const { data: consulta, error: errConsulta } = await sb
      .from('portal_inquiries')
      .select('id, lead_name, lead_phone, lead_email, lead_message, property_id, whatsapp_enviado_at, portal')
      .eq('id', inquiryId)
      .maybeSingle()
    if (errConsulta || !consulta) {
      // El motivo REAL, no un genérico. Un "no se pudo leer" a secas escondió
      // durante media hora que faltaba una columna: el mismo patrón que ya nos
      // mordió con `properties.expenses`. Si el error se traga, el síntoma es
      // "no pasa nada" y no hay por dónde empezar a buscar.
      return { enviado: false, motivo: `no se pudo leer la consulta: ${errConsulta?.message ?? 'no existe'}` }
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

    const decision = decidirEnvio(c, ajustes, opciones?.normalizar ?? normalizeWhatsappPhone)
    if (!decision.enviar) {
      return { enviado: false, motivo: decision.motivo, requiereAtencion: decision.visibleParaElEquipo }
    }

    const { data: propRow, error: errProp } = await sb
      .from('properties').select(COLUMNAS_PROPIEDAD).eq('id', c.property_id!).maybeSingle()
    if (errProp || !propRow) {
      return { enviado: false, motivo: 'la propiedad vinculada no existe', requiereAtencion: true }
    }
    const prop = propRow as PropiedadParaConsulta

    const etiqueta = nombrarPropiedad(prop)
    const eleccion: EleccionPlantilla = elegirPlantilla({ ...prop, etiqueta: prop.address ?? prop.title })
    const nombre = c.lead_name?.trim() || ''
    const params = parametrosDelCuerpo(eleccion, { nombre, propiedad: etiqueta })

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
          ? { type: eleccion.header.tipo, link: eleccion.header.link, filename: eleccion.headerFilename }
          : undefined,
        leadId,
        propertyId: prop.id,
        origen: 'consulta_portal',
        timeoutMs: 8000,
      })

    // Primero la cálida. Si Meta no la entrega —o todavía no está aprobada—,
    // la de trámite como red.
    let usada: string = eleccion.plantilla
    let res = await enviar(usada)
    const bloqueadaPorMarketing = !res.ok && res.errorCode != null && META_MARKETING_BLOQUEADO.has(res.errorCode)
    if (!res.ok && (bloqueadaPorMarketing || esPlantillaNoDisponible(res.error))) {
      const red = PLANTILLAS_UTIL[eleccion.plantilla]
      console.warn(
        bloqueadaPorMarketing
          ? `[consulta] Meta no entregó la de marketing (${res.errorCode}), se reintenta con ${red}`
          : `[consulta] ${usada} no está disponible, se reintenta con ${red}`,
      )
      usada = red
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

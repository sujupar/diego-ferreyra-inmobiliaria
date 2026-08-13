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
  cuerpoDePlantilla,
  elegirPlantilla,
  parametrosDelCuerpo,
  renderCuerpo,
  PLANTILLAS_UTIL,
  type EleccionPlantilla,
} from '@/lib/leads/consulta-template'
import {
  elegirAperturaV2,
  escaleraDeApertura,
  type IntentoDeApertura,
} from '@/lib/leads/consulta-apertura-v2'

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

/**
 * Dónde queda, sin repetir el barrio.
 *
 * Muchas direcciones ya vienen cargadas completas ("Entre Ríos 2333, Martínez,
 * San Isidro") y pegarles el barrio al final daba "…San Isidro, Martínez", que
 * es exactamente lo que llegó al WhatsApp de un cliente el 6 de agosto de 2026.
 * Comparación sin acentos ni mayúsculas: en la base conviven "Martinez" y
 * "Martínez" para el mismo lugar.
 */
export function ubicacionDeLaPropiedad(p: { address?: string | null; neighborhood?: string | null }): string {
  const address = (p.address ?? '').trim()
  const barrio = (p.neighborhood ?? '').trim()
  if (!address) return barrio
  if (!barrio) return address
  // Los acentos van escapados a propósito: escritos como caracteres sueltos son
  // marcas combinantes invisibles, imposibles de revisar en un diff.
  const SIN_ACENTOS = new RegExp('[\\u0300-\\u036f]', 'g')
  const plano = (v: string) => v.normalize('NFD').replace(SIN_ACENTOS, '').toLowerCase()
  return plano(address).includes(plano(barrio)) ? address : `${address}, ${barrio}`
}

/** "la casa de Entre Ríos 2333, Martínez" — como lo diría una persona. */
function nombrarPropiedad(p: PropiedadParaConsulta): string {
  const tipo = (p.property_type ?? '').toLowerCase()
  const articulo = tipo.startsWith('casa') ? 'la casa' : tipo ? `el ${tipo}` : 'la propiedad'
  const donde = ubicacionDeLaPropiedad(p)
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
      .select('id, lead_name, lead_phone, lead_email, lead_message, property_id, whatsapp_enviado_at, portal, property_url')
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
      property_url?: string | null
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

    // El lead se crea ANTES de mandar: si el WhatsApp sale y el lead no existe,
    // la respuesta del cliente llega a una conversación sin propiedad y el
    // agente no sabe de qué le hablan. Al revés no molesta a nadie.
    const leadId = await asegurarLead(sb, c, prop)

    const res = await enviarAperturaDeConsulta({
      telefono: decision.telefono,
      prop,
      nombre: c.lead_name?.trim() || '',
      leadId,
      // El enlace del aviso viene del mail del portal. Argenprop lo manda
      // (38 de 40); ZonaProp nunca (0 de 193), y ahí la apertura va sin enlace.
      enlaceAviso: c.property_url ?? null,
    })

    if (!res.ok) {
      return { enviado: false, motivo: `no se pudo enviar: ${res.error ?? 'error de Meta'}`, requiereAtencion: true }
    }
    if (res.skipped) {
      return { enviado: false, motivo: 'modo prueba de WhatsApp: no se mandó nada', requiereAtencion: false }
    }
    const usada = res.plantillaUsada

    await sb.from('portal_inquiries').update({ whatsapp_enviado_at: new Date().toISOString() }).eq('id', c.id)
    return { enviado: true, motivo: 'enviado', plantillaUsada: usada }
  } catch (err) {
    console.error('[consulta] excepción al responder (la consulta queda igual):', err)
    return { enviado: false, motivo: 'excepción interna', requiereAtencion: true }
  }
}

/**
 * MANDA LA APERTURA: el primer mensaje de una conversación, con el plano o el
 * video en el encabezado.
 *
 * Es UNA SOLA función a propósito. La usan el disparador de una consulta real
 * (`responderConsulta`, acá arriba) y la palabra de reinicio de las pruebas
 * (`lib/ai/reset-prueba.ts`). Si fueran dos, la prueba dejaría de probar lo que
 * pasa de verdad en cuanto una de las dos cambiara — que es exactamente el
 * problema que este proyecto ya tuvo con el productor y el consumidor de las
 * piezas de campaña.
 *
 * Elige la plantilla según el material cargado, y si Meta no entrega la cálida
 * —tope de marketing de esa persona, o promociones desactivadas— reintenta con
 * la de trámite. NUNCA lanza.
 */
export async function enviarAperturaDeConsulta(input: {
  telefono: string
  prop: PropiedadParaConsulta
  nombre: string
  leadId: string | null
  /**
   * El enlace del aviso, tal como viene en el mail del portal. Argenprop lo
   * manda casi siempre; ZonaProp nunca. Sin enlace se usa la variante que no lo
   * pide: un parámetro vacío hace que Meta rechace el envío entero.
   */
  enlaceAviso?: string | null
}): Promise<{ ok: boolean; skipped: boolean; error?: string; plantillaUsada: string }> {
  const { telefono, prop, nombre, leadId, enlaceAviso } = input
  const etiqueta = nombrarPropiedad(prop)
  const eleccion: EleccionPlantilla = elegirPlantilla({ ...prop, etiqueta: prop.address ?? prop.title })
  const params = parametrosDelCuerpo(eleccion, { nombre, propiedad: etiqueta })
  const aperturaV2 = elegirAperturaV2({
    nombre,
    propiedad: etiqueta,
    enlace: enlaceAviso,
    video: prop.video_file_url,
    fotos: prop.photos,
  })

  const enviar = async (intento: IntentoDeApertura) =>
    sendWhatsappTemplate({
      to: telefono,
      templateName: intento.plantilla,
      languageCode: process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_AR',
      bodyParams: intento.params,
      // El texto EXACTO que va a leer la persona, para que quede guardado como
      // el mensaje que es. Sin esto se guardaban los parámetros pegados con
      // puntos, y el agente —que lee esa columna para saber qué dijo la vez
      // anterior— arrancaba sin entender su propio mensaje: volvía a preguntar
      // lo que la plantilla ya había preguntado.
      bodyText: renderCuerpo(intento.cuerpo, intento.params),
      // Solo los peldaños v1 adjuntan algo. La v2 no manda plano ni video: el
      // video se ofrece en el texto y se manda después, si la persona quiere.
      headerMedia: intento.header
        ? { type: intento.header.tipo, link: intento.header.link, filename: intento.header.filename }
        : undefined,
      leadId,
      propertyId: prop.id,
      origen: 'consulta_portal',
      // Este primer mensaje lo manda el sistema, no una persona: es el agente
      // abriendo la conversación. Marcarlo así es lo que le permite después
      // reconocerlo como propio y no repetirse.
      aiGenerated: true,
      timeoutMs: 8000,
    })

  // Se baja la escalera hasta que una plantilla entre: primero las v2 cortas,
  // y las viejas como red mientras Meta termina de aprobarlas. El porqué de cada
  // peldaño está en `escaleraDeApertura`.
  const escalera = escaleraDeApertura(aperturaV2, {
    plantilla: eleccion.plantilla,
    plantillaUtil: PLANTILLAS_UTIL[eleccion.plantilla],
    params,
    cuerpo: cuerpoDePlantilla(eleccion, false),
    cuerpoUtil: cuerpoDePlantilla(eleccion, true),
    header: eleccion.header
      ? { tipo: eleccion.header.tipo, link: eleccion.header.link, filename: eleccion.headerFilename }
      : undefined,
  })

  let usada = escalera[0].plantilla
  let res = await enviar(escalera[0])
  for (let i = 1; i < escalera.length && !res.ok; i++) {
    const bloqueadaPorMarketing = res.errorCode != null && META_MARKETING_BLOQUEADO.has(res.errorCode)
    // Solo se sigue bajando ante "no existe" o "Meta no la entrega". Cualquier
    // otro error (teléfono inválido, token vencido) NO se reintenta: bajar la
    // escalera ahí sería mandar cuatro veces el mismo error y, peor, esconder la
    // causa real detrás del último peldaño.
    if (!bloqueadaPorMarketing && !esPlantillaNoDisponible(res.error)) break
    const siguiente = escalera[i]
    console.warn(
      bloqueadaPorMarketing
        ? `[consulta] Meta no entregó ${usada} (${res.errorCode}), se reintenta con ${siguiente.plantilla}`
        : `[consulta] ${usada} no está disponible, se reintenta con ${siguiente.plantilla}`,
    )
    usada = siguiente.plantilla
    res = await enviar(siguiente)
  }

  // `skipped` se devuelve APARTE de `ok`: "modo prueba, no se mandó nada" no es
  // un fallo, y colapsarlos haría que el equipo lea "no se pudo enviar" cuando
  // en realidad el envío está deshabilitado a propósito.
  return { ok: res.ok, skipped: !!res.skipped, error: res.error, plantillaUsada: usada }
}

/** Las columnas que necesita `enviarAperturaDeConsulta`. */
export const COLUMNAS_APERTURA = COLUMNAS_PROPIEDAD
export type { PropiedadParaConsulta }

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

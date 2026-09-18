/**
 * Qué plantilla lleva cada aviso de consulta al equipo, y si va con botón.
 *
 * ## Por qué existe (incidente 2026-09-17)
 *
 * `consulta_portal_v2` trae un botón "Responder al interesado" cuya URL se
 * completa en CADA envío con el código del link corto al chat del interesado.
 * Meta exige ese dato: si la plantilla declara el botón y el envío no lo trae,
 * rechaza el mensaje ENTERO con `(#131008) Required parameter is missing`.
 *
 * Y el link corto no siempre existe: se arma con el teléfono del interesado, y
 * a veces no hay (MercadoLibre lo oculta, en Argenprop muchos dejan solo el
 * email) o está mal escrito ("541103305864", "44652269"). El código anterior
 * mandaba igual la plantilla con botón, sin el dato. Entre el 5 y el 17 de
 * septiembre 12 consultas no le llegaron a nadie por eso, y nada avisó: el
 * rechazo quedaba anotado en `portal_inquiry_notifications` y el cron seguía
 * respondiendo "ok".
 *
 * La salida es mandar, en esos casos, la plantilla gemela SIN botón. Tiene el
 * mismo texto carácter por carácter y los mismos 10 datos (verificado contra la
 * API de Meta el 2026-09-17): el aviso llega igual, solo sin el botón, y el
 * cuerpo ya dice "⚠️ No pude armar el link porque falta un teléfono válido".
 *
 * ## La regla, al revés también
 *
 * Una plantilla SIN botón no puede recibir el dato del botón: Meta también
 * rechaza el envío entero. Por eso no alcanza con "mandar el código si hay":
 * hay que decidir las dos cosas juntas, y en un solo lugar.
 */

/**
 * Cada plantilla con botón, con su gemela sin botón.
 *
 * Una plantilla con botón que no esté acá se trata como SIN botón — nunca se le
 * manda el dato, así que un nombre nuevo configurado en Netlify no rompe nada:
 * sale sin botón hasta que se la dé de alta acá con su gemela.
 */
export const PLANTILLA_SIN_BOTON: Readonly<Record<string, string>> = {
  consulta_portal_v2: 'consulta_portal_util',
}

export interface EnvioDelAviso {
  templateName: string
  /** Solo presente cuando la plantilla elegida declara el botón. */
  urlButtonParam?: string
}

/**
 * `plantillaConfigurada` es la de `WHATSAPP_TEMPLATE_NAME`. `codigoBoton` es el
 * código del link corto al chat del interesado, o nada si no se pudo armar.
 */
export function elegirPlantillaDelAviso(
  plantillaConfigurada: string,
  codigoBoton?: string | null,
): EnvioDelAviso {
  const gemela = PLANTILLA_SIN_BOTON[plantillaConfigurada]
  if (!gemela) return { templateName: plantillaConfigurada }
  const codigo = (codigoBoton ?? '').trim()
  return codigo
    ? { templateName: plantillaConfigurada, urlButtonParam: codigo }
    : { templateName: gemela }
}

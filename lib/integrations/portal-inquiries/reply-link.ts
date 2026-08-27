/**
 * El link "Responder al interesado" del aviso de consulta que recibe el equipo.
 *
 * ## POR QUÉ ESTE LINK NO SE ACORTA (la razón de que este archivo exista)
 *
 * WhatsApp intercepta NATIVAMENTE los links a sus propios dominios. Un
 * `https://wa.me/<tel>?text=<saludo>` tocado DESDE ADENTRO de WhatsApp abre el
 * chat de esa persona con el mensaje ya escrito, sin pasar por el navegador.
 *
 * Ese comportamiento se pierde apenas el link apunta a otro dominio. Entre el
 * 2026-06-30 y el 2026-08-27 este link se pasaba por TinyURL (commit ce9aa8f,
 * por motivos ESTÉTICOS: "que quede tipo tinyurl.com/xxxx"). Resultado: WhatsApp
 * veía `tinyurl.com`, un dominio ajeno, y abría su navegador interno; recién ahí
 * TinyURL redirigía a wa.me, que YA EN EL NAVEGADOR muestra su pantalla
 * intermedia de "Continuar al chat" — esperar unos segundos y tocar otra vez.
 * O sea: el acortador sacaba al asesor de WhatsApp para devolverlo dos clics
 * después.
 *
 * **Un acortador PROPIO no arreglaría nada.** El problema no es de quién es el
 * dominio, es que cualquier salto por un dominio que no sea de WhatsApp rompe
 * la intercepción nativa. `inmodf.com.ar/r/abc` haría exactamente lo mismo que
 * `tinyurl.com/abc`. La única forma de que el chat abra directo es que el link
 * que viaja en el mensaje SEA el `wa.me`. NO REINTRODUCIR NINGÚN ACORTADOR ACÁ.
 *
 * ## El precio: el link se ve largo, y hay un techo real
 *
 * Meta corta el cuerpo renderizado de una plantilla en 1024 caracteres, y si se
 * pasa RECHAZA el envío entero — o sea, nadie se entera de la consulta. Como el
 * `wa.me` crudo es largo (el saludo va URL-encodeado adentro), el largo dejó de
 * ser un detalle estético y pasó a ser un presupuesto que hay que respetar.
 *
 * Por eso el saludo viene en VARIANTES de más completa a más corta y se elige la
 * más larga que entre. Se recorta por FRASE, nunca por carácter: un saludo
 * cortado al medio lo lee el cliente, y una URL cortada al medio no es un link.
 * Si no entra ni el saludo más corto, va el `wa.me` pelado — que igual abre el
 * chat, solo que sin texto precargado.
 *
 * Módulo puro y sin dependencias de servidor, para poder testear el presupuesto
 * sin mandar nada.
 */

import { renderCuerpo } from '../whatsapp/cuerpos'

/** Tope de Meta para el cuerpo renderizado de una plantilla. Pasarse = envío rechazado. */
export const MAX_CUERPO_META = 1024

export interface DatosDelSaludo {
  /** Cómo se llama el interesado. Sin nombre, el saludo arranca en "Hola,". */
  leadName: string | null
  /** Quién firma: el asesor asignado, o Diego cuando no hay match. */
  advisorName: string
  /**
   * Cómo nombrar la propiedad ANTE EL INTERESADO. `null` = no mencionarla:
   * mejor un saludo genérico que mandarle un código interno nuestro.
   */
  propertyLabel: string | null
  /**
   * El enlace del aviso del portal del que vino la consulta, si lo tenemos.
   * Va al FINAL del saludo, en su propio renglón, para que el interesado tenga a
   * mano el aviso que estuvo mirando (pedido del dueño, 2026-08-27).
   *
   * Se ignora si no es un enlace: `avisoLabel` a veces trae un código o un
   * título ("⚠️ CÓD 12345 · Departamento 2 ambientes") y eso, pegado en el
   * mensaje al cliente, es basura interna nuestra.
   */
  avisoUrl?: string | null
}

/**
 * El saludo precargado, de la versión más completa a la más escueta.
 *
 * Siempre son frases terminadas: la que se elija es la que va a leer el
 * interesado en su chat, así que ninguna puede quedar colgada a mitad.
 */
export function variantesDeSaludo({ leadName, advisorName, propertyLabel, avisoUrl }: DatosDelSaludo): string[] {
  const nombre = (leadName ?? '').trim()
  const asesor = advisorName.trim() || 'el equipo'
  const apertura = nombre ? `Hola ${nombre}, buen día!` : 'Hola, buen día!'
  const presentacion = `${apertura} Mi nombre es ${asesor}, un gusto saludarte.`
  const porQue = propertyLabel
    ? ` Te escribo por tu consulta de la propiedad en ${propertyLabel}.`
    : ' Te escribo por la consulta que nos hiciste.'

  // Solo si es un enlace de verdad: ver `avisoUrl`.
  const aviso = (avisoUrl ?? '').trim()
  const conAviso = /^https?:\/\//i.test(aviso) ? `${presentacion}${porQue}\n\n${aviso}` : null

  // De más completa a más corta. El aviso es lo PRIMERO que cede si no entra:
  // el saludo sin enlace sigue sirviendo, un enlace sin saludo no.
  const variantes = [conAviso, `${presentacion}${porQue}`, presentacion, apertura].filter(
    (v): v is string => v !== null,
  )
  // Sin duplicados y en orden estricto de largo: el buscador de más abajo se
  // queda con la primera que entra, así que dos iguales serían una pasada al pedo.
  return variantes.filter((s, i) => i === 0 || s.length < variantes[i - 1].length)
}

/**
 * Cuántos caracteres quedan para el link, una vez descontados el texto fijo de
 * la plantilla aprobada y los otros nueve parámetros.
 *
 * Se calcula contra el cuerpo REAL aprobado en Meta (`CUERPOS_DE_PLANTILLA`), no
 * contra una copia: si algún día se edita la plantilla, el presupuesto se ajusta
 * solo en vez de quedar viejo y empezar a rechazar envíos.
 */
export function espacioParaElLink(
  cuerpoPlantilla: string,
  otrosParams: string[],
  max = MAX_CUERPO_META,
): number {
  return Math.max(0, max - renderCuerpo(cuerpoPlantilla, otrosParams).length)
}

/**
 * El `wa.me` más completo que entre en el espacio disponible.
 *
 * `phone` viene ya normalizado (E.164 sin '+'). Sin teléfono no se inventa un
 * link: se avisa en texto, porque un link roto en el mensaje es peor que la
 * ausencia del link — el asesor lo toca, no pasa nada y no sabe por qué.
 */
export function armarLinkRespuesta(
  phone: string | null,
  variantes: string[],
  espacio: number,
): string {
  if (!phone) return '⚠️ No pude armar el link porque falta un teléfono válido'
  const pelado = `https://wa.me/${phone}`
  for (const saludo of variantes) {
    // Se encodea la frase ENTERA, ya elegida. Recortar después de encodear
    // partiría un %XX al medio y dejaría una URL inválida.
    //
    // Se normalizan los espacios PERO NO los saltos de línea (`[^\S\n]`): el
    // enlace del aviso va en su propio renglón, y un `\s+` los aplastaría todos
    // dejando el saludo y el enlace pegados en una sola línea. Los saltos no
    // rompen nada — `encodeURIComponent` los convierte en %0A.
    const limpio = saludo.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    const link = `${pelado}?text=${encodeURIComponent(limpio)}`
    if (link.length <= espacio) return link
  }
  return pelado
}

/**
 * Deja un parámetro como Meta lo acepta: sin saltos de línea, sin tabs y sin
 * espacios repetidos, que hacen rechazar el envío entero.
 *
 * **Una URL no se trunca nunca, cueste lo que cueste el largo.** Media URL no es
 * un link: es texto azul que no lleva a ningún lado. Así se veía el campo
 * "Aviso" hasta hoy — cortado en 120 con un "…" al final, o sea inservible
 * justo cuando el asesor quiere abrir el aviso del portal. Del largo se ocupa
 * `ajustarAlTope`, que sabe cuánto sobra de verdad.
 */
export function sanitizarParametro(s: string | null | undefined, max: number): string {
  const limpio = (s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!limpio) return '-'
  if (/^https?:\/\//i.test(limpio)) return limpio
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio
}

/**
 * Red de seguridad final: garantiza que el cuerpo entre en el tope de Meta.
 *
 * Existe porque pasarse no degrada el mensaje, lo BORRA: Meta rechaza el envío y
 * nadie se entera de la consulta. Con las URLs sin truncar (ver arriba) un aviso
 * excepcionalmente largo podría empujar el total por encima del tope.
 *
 * Cede UNO solo, el que se le indique — en la práctica el aviso, que es
 * informativo. El link de responder no cede nunca: es la acción del mensaje, y
 * ya se armó midiendo lo que había disponible.
 */
export function ajustarAlTope(
  cuerpoPlantilla: string,
  params: string[],
  indiceQueCede: number,
  max = MAX_CUERPO_META,
): string[] {
  const exceso = renderCuerpo(cuerpoPlantilla, params).length - max
  if (exceso <= 0) return [...params]
  const ajustados = [...params]
  const actual = ajustados[indiceQueCede] ?? ''
  // -1 deja lugar para el "…" que avisa que está recortado.
  const largo = Math.max(0, actual.length - exceso - 1)
  ajustados[indiceQueCede] = largo > 0 ? `${actual.slice(0, largo)}…` : ''
  return ajustados
}

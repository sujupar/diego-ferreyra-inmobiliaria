/**
 * El TEXTO REAL de cada plantilla aprobada, para que el equipo lea en el Inbox
 * exactamente lo que leyó el cliente.
 *
 * POR QUÉ EXISTE: `whatsapp_messages.body_preview` guardaba, para las
 * plantillas, los PARÁMETROS pegados con puntos. En el chat del equipo se veía
 *
 *     Juan · Roque Pérez 3059 · https://inmodf.com.ar/v/Kyf23SuNv2
 *
 * cuando lo que la persona recibió fue "Hola Juan, ¿cómo estás? Te envío el
 * recorrido de Roque Pérez 3059…". El asesor no tiene forma de saber qué se le
 * dijo al cliente, y encima parece un mensaje roto.
 *
 * ## Los textos son COPIA EXACTA de lo que aprobó Meta
 *
 * Los cuerpos NO se escriben acá: se generan desde Meta con
 * `scripts/sincronizar-cuerpos-plantillas.ts` y viven en `./cuerpos-aprobados.ts`.
 * Es la parte delicada de todo esto: si el texto local se desincroniza del
 * aprobado, la pantalla le mostraría al equipo un mensaje que el cliente NUNCA
 * recibió — peor que mostrar los parámetros, porque nadie sospecharía nada.
 * Correlo después de crear o editar cualquier plantilla.
 *
 * ## Cómo se usa
 *
 *   - AL MANDAR: `sendWhatsappTemplate` completa solo el texto si el que llama
 *     no lo pasó. Así un caller nuevo no puede volver a introducir el bug por
 *     olvido — que es exactamente como llegó hasta acá.
 *   - AL MOSTRAR: el Inbox rearma el mensaje de los envíos VIEJOS, que ya
 *     quedaron guardados con los parámetros. No hace falta migrar datos.
 */
import { CUERPOS_APROBADOS } from './cuerpos-aprobados'

/**
 * Nombre de plantilla → cuerpo aprobado, con los `{{n}}` tal cual.
 *
 * Viene GENERADO desde Meta (`scripts/sincronizar-cuerpos-plantillas.ts`), no
 * transcrito a mano: transcribir 19 cuerpos garantiza que alguno quede viejo, y
 * un cuerpo viejo acá le mostraría al equipo un mensaje que el cliente nunca
 * recibió.
 *
 * OJO con `recorrido_acceso_util` y `consulta_portal_util`: usan los marcadores
 * fuera de orden (`{{2}}` antes que `{{1}}`) y hasta `{{10}}`. El renderizador
 * no asume orden ni cantidad.
 */
export const CUERPOS_DE_PLANTILLA: Record<string, string> = CUERPOS_APROBADOS

/** El separador con el que se guardaban los parámetros de una plantilla. */
export const SEPARADOR_DE_PARAMETROS = ' · '

/** Cuántas variables distintas tiene un cuerpo (`{{1}}…{{3}}` → 3). */
export function cantidadDeVariables(cuerpo: string): number {
  const n = [...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))
  return n.length > 0 ? Math.max(...n) : 0
}

/**
 * El cuerpo con los `{{n}}` reemplazados. Recorre los MARCADORES, no los
 * parámetros: así `{{10}}` no se rompe contra `{{1}}` y el orden en que
 * aparecen en el texto da igual.
 */
export function renderCuerpo(cuerpo: string, params: string[]): string {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '')
}

/**
 * El texto que recibió la persona, para una plantilla conocida.
 *
 * `null` cuando no se puede armar con CERTEZA — plantilla que no está en el
 * registro, o cantidad de parámetros que no coincide con la del cuerpo. En ese
 * caso el caller deja lo que había: mostrar los parámetros es feo, pero
 * inventar un mensaje que el cliente no recibió es mucho peor.
 */
export function textoDePlantilla(nombre: string | null, params: string[]): string | null {
  if (!nombre) return null
  const cuerpo = CUERPOS_DE_PLANTILLA[nombre]
  if (!cuerpo) return null
  if (params.length !== cantidadDeVariables(cuerpo)) return null
  return renderCuerpo(cuerpo, params)
}

/**
 * Rearma el mensaje de un envío VIEJO, que quedó guardado como
 * `"Juan · Roque Pérez 3059 · https://…"`.
 *
 * Devuelve `null` si no es un caso reconocible; el caller muestra el texto tal
 * cual. Un `body_preview` que ya es el mensaje de verdad (los envíos nuevos)
 * NO se toca: se detecta porque no parte en la cantidad justa de parámetros.
 */
export function reconstruirDesdeParametros(
  templateName: string | null,
  bodyPreview: string | null,
): string | null {
  if (!templateName || !bodyPreview) return null
  const cuerpo = CUERPOS_DE_PLANTILLA[templateName]
  if (!cuerpo) return null
  // Si ya está el texto real guardado, no hay nada que rearmar.
  if (bodyPreview.includes('\n') || bodyPreview.startsWith('Hola ')) return null
  const params = bodyPreview.split(SEPARADOR_DE_PARAMETROS)
  return textoDePlantilla(templateName, params)
}

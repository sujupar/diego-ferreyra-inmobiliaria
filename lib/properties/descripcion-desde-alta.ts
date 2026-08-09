/**
 * Puente entre el formulario de alta de propiedad y el generador de
 * descripciones para portales.
 *
 * Todo acá es PURO: no hay fetch, no hay base. El formulario guarda todo como
 * texto (viene de `<input>`), y el generador espera números; esta conversión es
 * el único lugar donde eso pasa, para poder testearla sin navegador.
 */
import type { DatosParaDescripcion } from '@/lib/marketing/portal-descriptions/types'
import { esOperacion } from './operacion'

/** Los campos del alta que le sirven al generador. Todos texto: salen del formulario. */
export interface FormularioAlta {
  address: string
  neighborhood: string
  city: string
  property_type: string
  operation_type: string
  rooms: string
  bedrooms: string
  bathrooms: string
  garages: string
  covered_area: string
  total_area: string
  floor: string
  age: string
  asking_price: string
  currency: string
  description: string
}

function numero(valor: string): number | undefined {
  const limpio = (valor ?? '').trim()
  if (limpio === '') return undefined
  const n = Number(limpio)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Qué falta para que valga la pena generar. Sin dirección, barrio ni precio el
 * modelo escribe un aviso genérico de cualquier propiedad — que es exactamente
 * lo que el dueño NO pidió ("una descripción específica de esta propiedad").
 */
export function faltaParaGenerar(form: FormularioAlta): string[] {
  const faltan: string[] = []
  if (!form.address?.trim()) faltan.push('dirección')
  if (!form.neighborhood?.trim()) faltan.push('barrio')
  if (numero(form.asking_price) === undefined || (numero(form.asking_price) ?? 0) <= 0) {
    faltan.push('precio')
  }
  return faltan
}

export interface OpcionesDatos {
  /**
   * El último texto que ESTE sistema generó y cargó en el campo Descripción.
   *
   * Sirve para una sola cosa, y es importante: "volver a generar" no puede
   * devolverle al modelo su propia invención como si fuera un dato aportado por
   * el asesor. El prompt trata `description` como "descripción manual previa
   * (referencia, podés mejorarla)", así que reenviarle su salida lo encierra en
   * lo que ya dijo y consolida cualquier cosa que se haya inventado.
   */
  textoGenerado?: string | null
}

/**
 * Arma el objeto que consume `generatePortalDescription` a partir del
 * formulario. Los campos vacíos se omiten (el generador ya salta las líneas sin
 * dato) en vez de mandarse como 0 o "".
 */
export function datosParaDescripcion(
  form: FormularioAlta,
  opciones: OpcionesDatos = {},
): DatosParaDescripcion {
  const generado = (opciones.textoGenerado ?? '').trim()
  const escrito = (form.description ?? '').trim()
  // Si lo que hay en el campo es exactamente lo último que generamos, no es
  // dato del asesor: se manda vacío y el modelo vuelve a partir de los campos.
  const description = escrito !== '' && escrito !== generado ? escrito : undefined

  const operacion = esOperacion(form.operation_type) ? form.operation_type : 'venta'

  return {
    address: (form.address ?? '').trim(),
    neighborhood: (form.neighborhood ?? '').trim(),
    city: (form.city ?? '').trim() || 'CABA',
    property_type: (form.property_type ?? '').trim() || 'departamento',
    operation_type: operacion,
    asking_price: numero(form.asking_price) ?? 0,
    currency: (form.currency ?? '').trim() || 'USD',
    rooms: numero(form.rooms),
    bedrooms: numero(form.bedrooms),
    bathrooms: numero(form.bathrooms),
    garages: numero(form.garages),
    covered_area: numero(form.covered_area),
    total_area: numero(form.total_area),
    floor: numero(form.floor),
    age: numero(form.age),
    description,
  }
}

/**
 * Lo que se carga en el campo Descripción del formulario cuando el asesor
 * acepta lo generado. El TITULAR queda afuera a propósito: `properties.title`
 * no se escribe desde el alta (lo leen el Inbox, el nombre de la campaña en Ads
 * Manager, la landing pública y los portales, y no hay UI para corregirlo
 * después). El titular se muestra en pantalla para copiar y pegar al publicar.
 */
export function textoParaElCampo(generado: { subtitle: string; body: string }): string {
  const subtitulo = (generado.subtitle ?? '').trim()
  const cuerpo = (generado.body ?? '').trim()
  return [subtitulo, cuerpo].filter(Boolean).join('\n\n')
}

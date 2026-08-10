/**
 * Lector de respuestas tolerante, compartido por los asistentes de publicación
 * (MercadoLibre y Argenprop).
 *
 * POR QUÉ EXISTE: cuando una función se pasa del tiempo máximo, el gateway NO
 * devuelve JSON — devuelve su propia página HTML de error. Un `await r.json()`
 * pelado TIRA ahí, y esa excepción viajaba hasta el `onClick` del botón
 * "Siguiente", que ya había hecho `setSaving(true)`: el `setSaving(false)` nunca
 * corría y el botón quedaba en "Guardando…", deshabilitado, para siempre. La
 * única salida era recargar la página.
 *
 * El PATCH de estos asistentes es justo el que puede tardar: recalcula la
 * validación pidiéndole los atributos de la categoría al portal, y con el caché
 * de 24hs frío eso es un ida y vuelta a MercadoLibre sin techo de tiempo.
 *
 * Misma convención que `readJson` en `components/properties/LandingSection.tsx`
 * y en `MetaAdsWizardV2.tsx`: el error que ve la persona dice qué pasó, no
 * "Unexpected token '<'".
 */
export async function leerJson<T>(res: Response): Promise<T & { error?: string }> {
  let texto: string
  try {
    texto = await res.text()
  } catch {
    // El cuerpo se cortó a mitad de camino (conexión caída).
    return { error: 'Se cortó la conexión con el servidor. Volvé a intentar.' } as T & { error?: string }
  }
  try {
    return JSON.parse(texto) as T & { error?: string }
  } catch {
    return { error: mensajeSegunEstado(res.status) } as T & { error?: string }
  }
}

function mensajeSegunEstado(status: number): string {
  if (status === 504 || status === 502 || status === 408) {
    return 'El servidor tardó demasiado y cortó la operación. Volvé a intentar en un minuto.'
  }
  if (status === 401 || status === 403) {
    return 'Tu sesión venció o no tenés permiso para esta propiedad. Volvé a entrar.'
  }
  return `El servidor respondió algo inesperado (error ${status}). Volvé a intentar.`
}

/**
 * ¿El video del reel es NUESTRO y de ESTA propiedad?
 *
 * ## Por qué esto es un control de seguridad y no una validación de formato
 *
 * La URL del video llega en el cuerpo del pedido, o sea que la arma el
 * navegador. El cron después se la pasa a Instagram para que la DESCARGUE y la
 * PUBLIQUE en la cuenta de la inmobiliaria, que tiene 26.000 seguidores.
 *
 * Sin esta comprobación, cualquiera con permiso de difundir podía mandar
 * `https://loquesea.com/video.mp4` y publicar contenido arbitrario, de cualquier
 * origen, en la cuenta de la empresa. El permiso de difundir lo tiene todo el
 * equipo, incluidos los asesores.
 *
 * Es el mismo candado que ya tienen las fotos, el video y los planos en
 * `app/api/properties/[id]/media/commit`. Acá estaba faltando.
 */

/**
 * Comparación por PREFIJO EXACTO, nunca `includes`.
 *
 * Con `includes`, una URL como `https://atacante.com/?x=https://<proyecto>...`
 * pasaría el control. Es la misma lección que el acortador de enlaces del
 * repo, donde comparar hosts con `includes` habría dejado pasar
 * `wa.me.evil.com`.
 */
export function esVideoDeLaPropiedad(
  videoUrl: string,
  propertyId: string,
  supabaseUrl: string | undefined,
): boolean {
  if (!videoUrl || !propertyId) return false

  // Sin la dirección del almacenamiento no hay con qué comparar. Falla cerrado:
  // dejar pasar "porque no puedo verificar" es justamente el agujero.
  const base = (supabaseUrl || '').replace(/\/+$/, '')
  if (!base) return false

  // OJO con la barra final: si `NEXT_PUBLIC_SUPABASE_URL` viene con `/` al
  // final y no se normaliza, el prefijo no coincide NUNCA y se rompen todas las
  // subidas. Ya pasó en este proyecto (está en CLAUDE.md).
  const prefijo = `${base}/storage/v1/object/public/property-files/properties/${propertyId}/reels/`
  return videoUrl.startsWith(prefijo)
}

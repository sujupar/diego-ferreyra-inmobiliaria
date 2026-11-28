// Limpieza de las muestras crudas antes de guardarlas en el repo.
// Saca todo lo que habla de la cuenta que mira (la del robot) y los secretos de la sesión.

// Claves sobre la cuenta que mira o su relación con la cuenta mirada (likes, guardados,
// amigos en común, "le gustó a X y otros" — eso sale del círculo social de Julian).
const CLAVE_PRIVADA =
  /viewer|friendship_status|has_liked|has_disliked|saved_collection|mutual_followers|top_likers|social_context|csrf|sessionid|ds_user|fbid_v2|^av$|^__user$|rank_token/i

// Claves pesadas que no aportan a las pruebas (manifiestos de video, prefetch).
const CLAVE_PESADA =
  /video_dash_manifest|all_video_dash_prefetch_representations|video_versions|^thumbnails$|^clips_metadata$|^music_metadata$|^additional_candidates$|^sharing_friction_info$|^debug_info$|^grid_overlay_debug_info$/

/** Arrays más largos que esto se recortan: las muestras no necesitan cientos de elementos. */
const MAX_ELEMENTOS = 12

function limpiar(valor: unknown, clave = ''): unknown {
  // De las versiones de una imagen alcanza con la primera (la más grande).
  if (Array.isArray(valor)) return valor.slice(0, clave === 'candidates' ? 1 : MAX_ELEMENTOS).map((v) => limpiar(v))
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor)) {
      if (CLAVE_PRIVADA.test(k) || CLAVE_PESADA.test(k)) continue
      out[k] = limpiar(v, k)
    }
    return out
  }
  return valor
}

/**
 * Devuelve el JSON limpio como texto. `secretos` son pares [valor, marca] que se
 * reemplazan donde aparezcan literalmente (sessionid, csrf, id de la cuenta que mira).
 * Si después de reemplazar sobrevive alguno, tira: nunca se escribe una muestra sucia.
 */
export function sanearMuestra(json: unknown, secretos: Array<[string, string]>): string {
  let texto = JSON.stringify(limpiar(json), null, 2)
  const reales = secretos.filter(([v]) => v.length >= 4)
  for (const [valor, marca] of reales) texto = texto.split(valor).join(marca)
  for (const [valor] of reales) {
    if (texto.includes(valor)) throw new Error('quedó un secreto en la muestra')
  }
  return texto
}

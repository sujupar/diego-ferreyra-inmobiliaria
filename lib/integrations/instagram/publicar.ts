/**
 * Publicar un reel en Instagram, y listar los que ya están publicados.
 *
 * ## Publicar son DOS pasos separados por minutos
 *
 * Instagram no publica al instante: se le pide un "contenedor" con la URL del
 * video, él lo descarga y lo procesa —puede tardar minutos— y recién cuando
 * termina se lo publica. Por eso acá no hay ninguna función que haga las dos
 * cosas: esperar adentro de un request lo cortaría el límite de tiempo de
 * Netlify, y el gateway devolvería una página HTML de error que del lado del
 * navegador se ve como `Unexpected token '<'`.
 *
 * Quien encadena los pasos es el cron, una etapa por corrida.
 */
import { cuentaInstagram, instagramFetch } from './client'

/** Traducción de los estados de Instagram a los nuestros. */
export type EstadoContenedor = 'EN_PROCESO' | 'LISTO' | 'YA_PUBLICADO' | 'ERROR' | 'VENCIDO'

export interface ReelPublicado {
  id: string
  permalink: string | null
  descripcion: string | null
  miniatura: string | null
  fecha: string | null
  comentarios: number
}

/**
 * Pide el contenedor. Devuelve su identificador; todavía NO hay nada publicado.
 *
 * `share_to_feed` va en `true` a propósito: sin eso el reel no aparece al entrar
 * al perfil de la inmobiliaria, que es adonde llega la gente desde los anuncios.
 */
export async function crearContenedorReel(a: {
  videoUrl: string
  descripcion: string
}): Promise<string> {
  // Instagram baja el video por su cuenta desde esta URL. Se comprueba antes de
  // llamar: un error de forma acá se vería recién minutos después, como un
  // contenedor en estado ERROR sin explicación.
  if (!a.videoUrl.startsWith('https://')) {
    throw new Error('La URL del video tiene que ser https:// para que Instagram pueda descargarlo.')
  }

  const { igId } = cuentaInstagram()
  const respuesta = await instagramFetch<{ id?: string }>(`/${igId}/media`, {
    method: 'POST',
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: a.videoUrl,
      caption: a.descripcion,
      share_to_feed: true,
    }),
  })

  if (!respuesta.id) {
    throw new Error('Instagram aceptó el pedido pero no devolvió el identificador del contenedor.')
  }
  return respuesta.id
}

/**
 * ¿Terminó de procesar?
 *
 * Lo desconocido se trata como EN_PROCESO, nunca como listo: dar por terminado
 * algo que no entendemos publicaría un reel a medio procesar o rompería el paso
 * siguiente con un identificador vacío.
 *
 * `PUBLISHED` NO es lo mismo que `FINISHED`, y confundirlos sale caro:
 * `FINISHED` significa "terminé de procesarlo, publicalo"; `PUBLISHED`
 * significa "esto YA está publicado". Se llega a `PUBLISHED` cuando publicamos
 * y después falló la escritura en nuestra base. Tratarlo como `LISTO` hacía que
 * la corrida siguiente volviera a llamar a `media_publish` sobre algo ya
 * publicado → error → el reel quedaba marcado `fallido` aunque estuviera
 * online, y un "Reintentar" publicaba un SEGUNDO reel idéntico en la cuenta.
 */
export async function estadoContenedor(creationId: string): Promise<EstadoContenedor> {
  const { status_code } = await instagramFetch<{ status_code?: string }>(
    `/${creationId}?fields=status_code`,
  )
  switch (status_code) {
    case 'FINISHED':
      return 'LISTO'
    case 'PUBLISHED':
      return 'YA_PUBLICADO'
    case 'ERROR':
      return 'ERROR'
    case 'EXPIRED':
      return 'VENCIDO'
    default:
      return 'EN_PROCESO'
  }
}

/**
 * Publica el contenedor ya procesado.
 *
 * El enlace se pide aparte y su fallo NO tumba la publicación: el reel ya está
 * en Instagram. Marcarlo como fallido por no poder leer un enlace dejaría lo
 * peor de los dos mundos — publicado allá, fallido acá — y el reintento
 * publicaría un SEGUNDO reel igual.
 */
export async function publicarContenedor(
  creationId: string,
): Promise<{ igMediaId: string; permalink: string | null }> {
  const { igId } = cuentaInstagram()
  const publicado = await instagramFetch<{ id?: string }>(`/${igId}/media_publish`, {
    method: 'POST',
    body: JSON.stringify({ creation_id: creationId }),
  })

  if (!publicado.id) {
    throw new Error('Instagram publicó pero no devolvió el identificador del reel.')
  }

  let permalink: string | null = null
  try {
    const datos = await instagramFetch<{ permalink?: string }>(`/${publicado.id}?fields=permalink`)
    permalink = datos.permalink ?? null
  } catch {
    // Solo es el enlace para abrirlo cómodo. El reel ya existe.
  }

  return { igMediaId: publicado.id, permalink }
}

interface MediaDeInstagram {
  id?: string
  media_product_type?: string
  permalink?: string
  caption?: string
  thumbnail_url?: string
  timestamp?: string
  comments_count?: number
}

/**
 * Los reels ya publicados de la cuenta, para poder engancharlos.
 *
 * Se filtra por `media_product_type === 'REELS'`: la cuenta tiene 1.200
 * publicaciones y la mayoría son fotos y carruseles, que no sirven acá.
 */
export async function listarReelsPublicados(limite = 25): Promise<ReelPublicado[]> {
  const { igId } = cuentaInstagram()
  const campos = 'id,media_product_type,permalink,caption,thumbnail_url,timestamp,comments_count'
  // Se piden de más porque el filtro descarta las fotos y los carruseles.
  const aPedir = Math.min(limite * 4, 100)

  const respuesta = await instagramFetch<{ data?: MediaDeInstagram[] }>(
    `/${igId}/media?fields=${campos}&limit=${aPedir}`,
  )

  return (respuesta.data ?? [])
    .filter((m): m is MediaDeInstagram & { id: string } =>
      typeof m.id === 'string' && m.media_product_type === 'REELS')
    .slice(0, limite)
    .map((m) => ({
      id: m.id,
      permalink: m.permalink ?? null,
      descripcion: m.caption ?? null,
      miniatura: m.thumbnail_url ?? null,
      fecha: m.timestamp ?? null,
      comentarios: m.comments_count ?? 0,
    }))
}

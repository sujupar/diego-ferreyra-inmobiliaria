/**
 * Lo que se ENTREGA en la página de gracias: video recorrido, tour 3D, el video
 * propio de la propiedad, o las fotos completas cuando no hay ninguno.
 *
 * Se extrajo de `app/v/[token]/page.tsx` sin cambiar una línea de su marcado,
 * para que la vista previa del editor muestre exactamente lo mismo que el
 * cliente. Ver `ThanksPageView`.
 */
import type { DeliverKind } from '@/lib/properties/deliver-media'

export interface ThanksMediaProps {
  kind: DeliverKind
  url: string | null
  /** URL de embed (YouTube/Vimeo) o `null` si es un archivo propio, que va en un `<video>`. */
  embed: string | null
  photos: string[]
}

export function ThanksMedia({ kind, url, embed, photos }: ThanksMediaProps) {
  const isVideo = kind === 'video_recorrido' || kind === 'video_propio'
  return (
    <>
      {kind === 'tour_3d' && url && (
        <iframe
          src={url}
          title="Recorrido virtual"
          className="aspect-video w-full rounded-lg border"
          allow="fullscreen; xr-spatial-tracking"
        />
      )}
      {isVideo && url && (
        embed ? (
          <iframe
            src={embed}
            title={kind === 'video_recorrido' ? 'Video recorrido' : 'Video de la propiedad'}
            className="aspect-video w-full rounded-lg border"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video src={url} controls playsInline className="aspect-video w-full rounded-lg border" />
        )
      )}
      {kind === 'fotos' && photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />
          ))}
        </div>
      )}
      {kind === 'fotos' && photos.length === 0 && (
        <p className="text-black/60">
          Estamos preparando el material de esta propiedad. Un asesor se va a contactar con vos para mostrártela.
        </p>
      )}
    </>
  )
}

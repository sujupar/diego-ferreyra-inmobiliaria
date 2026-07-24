/**
 * E1.2 — Renderiza `properties.video_file_url` (archivo de video SUBIDO a Storage).
 *
 * Bug documentado: la landing sólo renderizaba `video_url` (embed YouTube/Vimeo)
 * y nunca el archivo subido. Este componente cierra ese hueco con un <video>.
 *
 * Defensa XSS: sólo acepta https:// (la URL va como `src` crudo). Mismo criterio
 * que VideoEmbed.
 */
interface VideoFileProps {
  url: string
  /** Foto de portada opcional (property.photos[0]) para el poster. */
  poster?: string
}

export function LandingVideoFile({ url, poster }: VideoFileProps) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url.trim())) return null

  return (
    <section className="py-12 md:py-16 px-6 md:px-12 lg:px-20 max-w-5xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-medium mb-6">Recorrido en video</h2>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video
          src={url}
          poster={poster}
          controls
          playsInline
          preload="none"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </section>
  )
}

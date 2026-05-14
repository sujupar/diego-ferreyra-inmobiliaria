interface VideoProps {
  url: string
}

// Detecta YouTube/Vimeo/mp4 y devuelve el iframe correcto.
function getEmbedUrl(url: string): { kind: 'iframe' | 'video'; src: string } {
  // YouTube: https://www.youtube.com/watch?v=ID o https://youtu.be/ID
  const ytMatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  )
  if (ytMatch) {
    return { kind: 'iframe', src: `https://www.youtube.com/embed/${ytMatch[1]}` }
  }
  // Vimeo: https://vimeo.com/ID
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) {
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeoMatch[1]}` }
  }
  // .mp4 / .webm
  if (/\.(mp4|webm|mov)$/i.test(url)) {
    return { kind: 'video', src: url }
  }
  // Default: tratamos como iframe (puede ser otro embed)
  return { kind: 'iframe', src: url }
}

export function LandingVideoEmbed({ url }: VideoProps) {
  const { kind, src } = getEmbedUrl(url)

  return (
    <section className="py-12 md:py-16 px-6 md:px-12 lg:px-20 max-w-5xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-medium mb-6">Video</h2>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {kind === 'iframe' ? (
          <iframe
            src={src}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video de la propiedad"
          />
        ) : (
          <video
            src={src}
            controls
            preload="metadata"
            className="absolute inset-0 h-full w-full"
          />
        )}
      </div>
    </section>
  )
}

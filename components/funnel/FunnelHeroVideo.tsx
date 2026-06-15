'use client'

import { useRef, useState } from 'react'

interface FunnelHeroVideoProps {
  src: string
  poster?: string
  className?: string
}

/**
 * Video con autoplay MUTED + playsInline (única forma de autoplay confiable en móvil),
 * con overlay "Activá el sonido" que activa el audio al primer click.
 */
export function FunnelHeroVideo({ src, poster, className }: FunnelHeroVideoProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)

  function enableSound() {
    const v = ref.current
    if (!v) return
    v.muted = false
    setMuted(false)
    void v.play().catch(() => {})
  }

  return (
    <div className={`relative overflow-hidden rounded-xl ${className ?? ''}`}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        autoPlay
        playsInline
        loop
        controls={!muted}
        preload="metadata"
        className="h-full w-full"
      />
      {muted && (
        <button
          type="button"
          onClick={enableSound}
          aria-label="Activar el sonido del video"
          className="absolute inset-0 flex items-center justify-center bg-black/30 text-white transition hover:bg-black/40"
        >
          <span className="rounded-full bg-[#00BF63] px-5 py-2.5 text-sm font-bold shadow-lg">
            🔊 Activá el sonido
          </span>
        </button>
      )}
    </div>
  )
}

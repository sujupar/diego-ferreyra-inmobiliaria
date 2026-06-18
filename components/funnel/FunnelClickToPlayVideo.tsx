'use client'

import { useState } from 'react'
import Image from 'next/image'

interface FunnelClickToPlayVideoProps {
  src: string
  poster?: string
  className?: string
}

/**
 * Video CLICK-TO-PLAY reutilizable (sin autoplay).
 *
 * Al montar muestra SOLO el poster (sin precargar el video: preload="none")
 * con un botón play centrado. Al hacer click monta y reproduce el <video>
 * con sonido — el autoPlay es válido porque ocurre tras un gesto del usuario.
 *
 * Mobile-first: contenedor relative w-full aspect-video.
 */
export function FunnelClickToPlayVideo({ src, poster, className }: FunnelClickToPlayVideoProps) {
  const [playing, setPlaying] = useState(false)

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl bg-black ${className ?? ''}`}
      style={{ aspectRatio: '16 / 9' }}
    >
      {playing ? (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          preload="none"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Reproducir video"
          className="group absolute inset-0 h-full w-full"
        >
          {poster && (
            <Image
              src={poster}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/40">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00BF63] shadow-lg transition group-hover:scale-105 sm:h-20 sm:w-20">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="ml-1 h-7 w-7 text-white sm:h-9 sm:w-9"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'

interface TestimonialLightboxProps {
  videoUrl: string
  clientName: string
  onClose: () => void
}

export function TestimonialLightbox({ videoUrl, clientName, onClose }: TestimonialLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Testimonio de ${clientName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-sm">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar video"
          className="absolute -top-10 right-0 text-2xl text-white"
        >
          ✕
        </button>
        <video
          src={videoUrl}
          controls
          autoPlay
          playsInline
          className="w-full rounded-xl bg-black"
        />
      </div>
    </div>
  )
}

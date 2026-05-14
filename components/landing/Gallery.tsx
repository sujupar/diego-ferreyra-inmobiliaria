'use client'

import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface GalleryProps {
  photos: string[]
}

export function LandingGallery({ photos }: GalleryProps) {
  const [active, setActive] = useState<number | null>(null)
  if (photos.length === 0) return null

  function prev() {
    setActive(i => (i === null ? null : (i - 1 + photos.length) % photos.length))
  }
  function next() {
    setActive(i => (i === null ? null : (i + 1) % photos.length))
  }

  return (
    <section className="py-12 md:py-16 px-6 md:px-12 lg:px-20 max-w-6xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-medium mb-6">Galería</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
        {photos.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className="relative aspect-square overflow-hidden rounded-lg bg-muted group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Foto ${i + 1}`}
              className="h-full w-full object-cover transition group-hover:scale-105"
              loading={i < 4 ? 'eager' : 'lazy'}
            />
          </button>
        ))}
      </div>

      {active !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <button
            type="button"
            onClick={() => setActive(null)}
            className="absolute top-4 right-4 text-white p-2"
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              prev()
            }}
            className="absolute left-4 text-white p-2"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[active]}
            alt={`Foto ${active + 1}`}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              next()
            }}
            className="absolute right-4 text-white p-2"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
            {active + 1} / {photos.length}
          </p>
        </div>
      )}
    </section>
  )
}

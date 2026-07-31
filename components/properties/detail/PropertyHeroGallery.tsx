'use client'

/**
 * Galería de portada de la ficha — SOLO LECTURA.
 * La edición (subir, reordenar, borrar) vive en la pestaña Multimedia.
 */
import { useEffect, useState } from 'react'
import { ImageOff, X } from 'lucide-react'
import { heroLayout } from '@/lib/properties/detail-view'

interface Props {
  photos: string[]
  address: string
  plansCount: number
  hasVideo: boolean
  hasTour: boolean
  /** Ausente = el rol no tiene pestaña Multimedia (abogado). */
  onGoToMedia?: () => void
}

export function PropertyHeroGallery({ photos, address, plansCount, hasVideo, hasTour, onGoToMedia }: Props) {
  const [openAt, setOpenAt] = useState<number | null>(null)

  useEffect(() => {
    if (openAt === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenAt(null)
      if (e.key === 'ArrowRight') setOpenAt(i => (i === null ? i : (i + 1) % photos.length))
      if (e.key === 'ArrowLeft') setOpenAt(i => (i === null ? i : (i - 1 + photos.length) % photos.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openAt, photos.length])

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--brand)]/75 text-white px-6 py-14 flex flex-col items-center justify-center gap-3 text-center">
        <ImageOff className="h-8 w-8 opacity-80" />
        <p className="display text-lg">Todavía no hay fotos de esta propiedad</p>
        <p className="text-sm text-white/75 max-w-md">
          Sin fotos no se puede publicar en portales ni lanzar campañas.
        </p>
        {onGoToMedia && (
          <button
            type="button"
            onClick={onGoToMedia}
            className="mt-2 rounded-lg bg-white text-[color:var(--brand)] px-5 py-2 text-sm font-semibold hover:bg-white/90 transition"
          >
            Subir fotos
          </button>
        )}
      </div>
    )
  }

  const layout = heroLayout(photos.length)
  const thumbs = photos.slice(1, 1 + layout.thumbs)
  const hidden = photos.length - 1 - thumbs.length

  const chips: string[] = [`${photos.length} foto${photos.length === 1 ? '' : 's'}`]
  if (plansCount > 0) chips.push(`${plansCount} plano${plansCount === 1 ? '' : 's'}`)
  if (hasVideo) chips.push('Video')
  if (hasTour) chips.push('Recorrido 360°')

  return (
    <>
      <div className={`grid gap-2 h-[280px] md:h-[420px] ${layout.grid}`}>
        <button
          type="button"
          onClick={() => setOpenAt(0)}
          aria-label={`Ver foto 1 de ${address}`}
          className={`relative overflow-hidden rounded-2xl bg-muted group ${layout.cover}`}
        >
          <img
            src={photos[0]}
            alt={`${address} — foto principal`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
          <span className="absolute left-3 bottom-3 flex flex-wrap gap-1.5">
            {chips.map(c => (
              <span key={c} className="rounded-full bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 backdrop-blur-sm">
                {c}
              </span>
            ))}
          </span>
        </button>

        {thumbs.map((url, i) => {
          const index = i + 1
          const isLast = i === thumbs.length - 1 && hidden > 0
          return (
            <button
              key={url}
              type="button"
              onClick={() => setOpenAt(index)}
              aria-label={`Ver foto ${index + 1} de ${address}`}
              className="relative overflow-hidden rounded-2xl bg-muted group"
            >
              <img
                src={url}
                alt={`${address} — foto ${index + 1}`}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
              {isLast && (
                <span className="absolute inset-0 bg-black/55 text-white flex items-center justify-center text-lg font-semibold">
                  +{hidden}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {openAt !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${address}`}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpenAt(null)}
        >
          <button className="absolute top-4 right-4 text-white" aria-label="Cerrar" onClick={() => setOpenAt(null)}>
            <X className="h-7 w-7" />
          </button>
          <button
            className="absolute left-4 text-white text-4xl px-3"
            aria-label="Foto anterior"
            onClick={e => { e.stopPropagation(); setOpenAt((openAt - 1 + photos.length) % photos.length) }}
          >‹</button>
          <img
            src={photos[openAt]}
            alt={`${address} — foto ${openAt + 1}`}
            className="max-h-[90vh] max-w-[92vw] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute right-4 text-white text-4xl px-3"
            aria-label="Foto siguiente"
            onClick={e => { e.stopPropagation(); setOpenAt((openAt + 1) % photos.length) }}
          >›</button>
          <span className="absolute bottom-5 text-white/80 text-sm tabular-n">{openAt + 1} / {photos.length}</span>
        </div>
      )}
    </>
  )
}

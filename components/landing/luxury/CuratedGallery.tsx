/**
 * E1.9 — Galería curada (server). Resuelve las URLs y delega la grilla+lightbox
 * al componente client. Sección bajo un fondo crema para separar del resto.
 */
import { GalleryLightbox } from './GalleryLightbox'

export function CuratedGallery({
  photos,
  eyebrow,
  title,
  freeCount,
  forceUnlocked,
}: {
  photos: string[]
  eyebrow?: string
  title?: string
  /** Fotos visibles sin registrarse (default 3). */
  freeCount?: number
  /** Editor: muestra la galería completa sin puerta de registro. */
  forceUnlocked?: boolean
}) {
  if (!photos?.length) return null
  return (
    <section
      className="lx-reveal border-y px-6 py-20 md:px-12 md:py-28 lg:px-16"
      style={{ borderColor: 'var(--lx-line)', background: 'var(--lx-bg-2)' }}
    >
      <div className="mx-auto max-w-6xl">
        <GalleryLightbox
          images={photos.map(src => ({ src }))}
          eyebrow={eyebrow}
          title={title}
          freeCount={freeCount}
          forceUnlocked={forceUnlocked}
        />
      </div>
    </section>
  )
}

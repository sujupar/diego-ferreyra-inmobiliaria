/**
 * E1.9 → v2 (2026-08-06) — Ubicación: copy de zona + MAPA estático no
 * interactivo cuando la propiedad tiene lat/lng (decisión del usuario — revierte
 * el "SIN mapa" original de E1.9). Sin coords: banda navy con el texto, como
 * siempre. Si hay foto exterior → full-bleed + card marfil. Server component.
 */
import { StaticMapTiles } from './StaticMapTiles'

interface LocationShowcaseProps {
  neighborhood: string | null
  city: string | null
  eyebrow?: string
  title?: string
  body?: string
  image?: string
  /** Mapa estático no interactivo (requiere lat/lng). */
  showMap?: boolean
  lat?: number | null
  lng?: number | null
}

export function LocationShowcase({
  neighborhood,
  city,
  eyebrow = 'Ubicación',
  title,
  body,
  image,
  showMap,
  lat,
  lng,
}: LocationShowcaseProps) {
  const zona = [neighborhood, city].filter(Boolean).join(', ')
  const heading = title || zona || 'La zona'
  const mapa = showMap && lat != null && lng != null ? <StaticMapTiles lat={lat} lng={lng} /> : null

  if (image) {
    return (
      <section className="lx-reveal relative flex min-h-[68vh] items-end overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/20" />
        <div
          className="relative m-6 max-w-lg border p-8 md:m-16 md:p-12"
          style={{ borderColor: 'var(--lx-line)', background: 'var(--lx-bg)' }}
        >
          <p className="lx-eyebrow">{eyebrow}</p>
          <h2 className="mt-3 text-3xl md:text-4xl">{heading}</h2>
          {body && (
            <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--lx-ink-soft)' }}>
              {body}
            </p>
          )}
        </div>
      </section>
    )
  }

  return (
    <section
      className="lx-reveal px-6 py-24 text-center md:py-32"
      style={{ background: 'var(--lx-navy)', color: 'var(--brand-foreground)' }}
    >
      <div className="mx-auto max-w-2xl">
        <p className="lx-eyebrow" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {eyebrow}
        </p>
        <h2 className="mt-3 text-3xl md:text-5xl" style={{ color: '#fff' }}>
          {heading}
        </h2>
        {body && (
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed md:text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {body}
          </p>
        )}
      </div>
      {mapa && <div className="mx-auto mt-10 max-w-3xl">{mapa}</div>}
    </section>
  )
}

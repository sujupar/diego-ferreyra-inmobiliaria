/**
 * E1.9 — Ubicación como IMAGEN + copy de zona (SIN mapa ni botón, por decisión
 * del usuario). Si hay foto exterior → full-bleed + card marfil; si no → banda
 * navy elegante con el texto. Server component.
 */
interface LocationShowcaseProps {
  neighborhood: string | null
  city: string | null
  eyebrow?: string
  title?: string
  body?: string
  image?: string
}

export function LocationShowcase({
  neighborhood,
  city,
  eyebrow = 'Ubicación',
  title,
  body,
  image,
}: LocationShowcaseProps) {
  const zona = [neighborhood, city].filter(Boolean).join(', ')
  const heading = title || zona || 'La zona'

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
    </section>
  )
}

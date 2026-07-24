/**
 * E1.8 — 3 beneficios INTANGIBLES (propiedad / ubicación / amenities).
 * Vende cómo se VIVE, no metros cuadrados. Server component.
 */
import { Home, MapPin, Sparkles, Star } from 'lucide-react'

type Tie = 'propiedad' | 'ubicacion' | 'amenities' | 'otro'

interface BenefitItem {
  tie: Tie
  title: string
  body: string
}

const ICON: Record<Tie, typeof Home> = {
  propiedad: Home,
  ubicacion: MapPin,
  amenities: Sparkles,
  otro: Star,
}

export function LandingIntangibleBenefits({
  eyebrow,
  items,
}: {
  eyebrow?: string
  items: BenefitItem[]
}) {
  if (!items?.length) return null
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:px-12 md:py-24 lg:px-20">
      {eyebrow && (
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-3 md:gap-8">
        {items.map((b, i) => {
          const Icon = ICON[b.tie] ?? Star
          return (
            <div
              key={i}
              className="flex flex-col rounded-2xl border bg-card p-7 transition-shadow hover:shadow-lg md:p-8"
            >
              <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-2xl md:text-[1.7rem]">{b.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{b.body}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

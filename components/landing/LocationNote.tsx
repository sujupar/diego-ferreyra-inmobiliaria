/**
 * E1.8 — Ubicación SUTIL: barrio + una línea de beneficio de zona.
 * SIN mapa ni botón "ver mapa completo" (decisión del usuario: el mapa da
 * demasiada info y no aporta a la conversión). Server component.
 */
import { MapPin } from 'lucide-react'

export function LandingLocationNote({
  neighborhood,
  city,
  note,
}: {
  neighborhood: string | null
  city: string | null
  note?: string
}) {
  const zona = [neighborhood, city].filter(Boolean).join(', ')
  return (
    <section className="mx-auto max-w-3xl px-6 py-14 text-center md:px-12 md:py-20 lg:px-20">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
        <MapPin className="h-5 w-5" />
      </span>
      {zona && <h2 className="mt-4 text-2xl md:text-3xl">{zona}</h2>}
      {note && (
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  )
}

/**
 * E1.8 — Solo lo ESENCIAL (3-4 datos tangibles). Es un gancho, NO la ficha
 * completa del portal: mostramos lo justo para dar contexto sin regalar toda la
 * info (si le damos todo, no se registra). Server component.
 */
import { Home, Bed, Square, Car, Bath } from 'lucide-react'

interface EssentialSpecsProps {
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  coveredArea: number | null
}

export function LandingEssentialSpecs({
  rooms,
  bedrooms,
  bathrooms,
  garages,
  coveredArea,
}: EssentialSpecsProps) {
  // Orden de prioridad; tomamos los primeros 4 que existan.
  const all: { icon: typeof Home; label: string; value: string }[] = []
  if (rooms) all.push({ icon: Home, label: 'Ambientes', value: String(rooms) })
  if (coveredArea) all.push({ icon: Square, label: 'Cubiertos', value: `${coveredArea} m²` })
  if (bedrooms) all.push({ icon: Bed, label: 'Dormitorios', value: String(bedrooms) })
  if (garages) all.push({ icon: Car, label: 'Cocheras', value: String(garages) })
  if (bathrooms) all.push({ icon: Bath, label: 'Baños', value: String(bathrooms) })
  const stats = all.slice(0, 4)
  if (stats.length === 0) return null

  return (
    <section className="mx-auto max-w-4xl px-6 py-10 md:px-12 lg:px-20">
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 rounded-2xl border bg-card px-6 py-7">
        {stats.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <s.icon className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium tabular-nums leading-none">{s.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

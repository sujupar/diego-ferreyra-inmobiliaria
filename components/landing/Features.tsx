import { Bed, Bath, Car, Square, Building2, CalendarDays, Wallet, Home } from 'lucide-react'

interface FeaturesProps {
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  coveredArea: number | null
  totalArea: number | null
  floor: number | null
  age: number | null
  expensas: number | null
  amenities: string[]
}

interface StatProps {
  icon: typeof Bed
  label: string
  value: string
}

function Stat({ icon: Icon, label, value }: StatProps) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-card border">
      <Icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-base font-medium tabular-nums mt-0.5">{value}</p>
      </div>
    </div>
  )
}

export function LandingFeatures({
  rooms,
  bedrooms,
  bathrooms,
  garages,
  coveredArea,
  totalArea,
  floor,
  age,
  expensas,
  amenities,
}: FeaturesProps) {
  const stats: StatProps[] = []
  if (rooms) stats.push({ icon: Home, label: 'Ambientes', value: String(rooms) })
  if (bedrooms) stats.push({ icon: Bed, label: 'Dormitorios', value: String(bedrooms) })
  if (bathrooms) stats.push({ icon: Bath, label: 'Baños', value: String(bathrooms) })
  if (garages) stats.push({ icon: Car, label: 'Cocheras', value: String(garages) })
  if (coveredArea) stats.push({ icon: Square, label: 'Sup. cubierta', value: `${coveredArea} m²` })
  if (totalArea && totalArea !== coveredArea) {
    stats.push({ icon: Square, label: 'Sup. total', value: `${totalArea} m²` })
  }
  if (floor != null) stats.push({ icon: Building2, label: 'Piso', value: String(floor) })
  if (age != null) stats.push({ icon: CalendarDays, label: 'Antigüedad', value: age === 0 ? 'A estrenar' : `${age} años` })
  if (expensas) {
    stats.push({
      icon: Wallet,
      label: 'Expensas',
      value: `$${expensas.toLocaleString('es-AR')}`,
    })
  }

  return (
    <section className="py-12 md:py-16 px-6 md:px-12 lg:px-20 max-w-6xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-medium mb-6">Características</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <Stat key={i} {...s} />
        ))}
      </div>

      {amenities.length > 0 && (
        <div className="mt-10">
          <h3 className="text-lg font-medium mb-4">Amenities y comodidades</h3>
          <div className="flex flex-wrap gap-2">
            {amenities.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full border bg-card px-3 py-1.5 text-sm capitalize"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

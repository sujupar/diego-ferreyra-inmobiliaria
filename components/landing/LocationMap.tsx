import { MapPin } from 'lucide-react'

interface MapProps {
  lat: number
  lng: number
  address: string
}

export function LandingLocationMap({ lat, lng, address }: MapProps) {
  // OpenStreetMap embed sin API key
  const bbox = `${lng - 0.005},${lat - 0.003},${lng + 0.005},${lat + 0.003}`
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`
  const directionsLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`

  return (
    <section className="py-12 md:py-16 px-6 md:px-12 lg:px-20 max-w-5xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-medium mb-2">Ubicación</h2>
      <p className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <MapPin className="h-4 w-4" />
        {address}
      </p>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border">
        <iframe
          src={mapSrc}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          title="Ubicación de la propiedad"
        />
      </div>
      <a
        href={directionsLink}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm underline text-[color:var(--brand)]"
      >
        Ver en mapa completo →
      </a>
    </section>
  )
}

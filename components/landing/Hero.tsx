interface HeroProps {
  title: string
  address: string
  neighborhood: string
  city: string
  price: number
  currency: string
  operationType: string
  heroImage?: string
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(price)
  } catch {
    return `${currency} ${price.toLocaleString('es-AR')}`
  }
}

const OPERATION_LABEL: Record<string, string> = {
  venta: 'En venta',
  alquiler: 'En alquiler',
  temporario: 'Alquiler temporario',
}

export function LandingHero({
  title,
  address,
  neighborhood,
  city,
  price,
  currency,
  operationType,
  heroImage,
}: HeroProps) {
  return (
    <section className="relative h-[80vh] min-h-[520px] w-full overflow-hidden">
      {heroImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/80" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
      )}

      <div className="relative h-full flex flex-col justify-end p-6 md:p-12 lg:p-20 text-white max-w-5xl mx-auto">
        <p className="text-xs tracking-[0.2em] uppercase opacity-80">
          {OPERATION_LABEL[operationType] ?? operationType}
        </p>
        <h1 className="mt-3 text-3xl md:text-5xl lg:text-6xl font-medium tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-base md:text-lg opacity-90">
          {address}, {neighborhood}, {city}
        </p>
        <p className="mt-6 text-2xl md:text-4xl font-medium tabular-nums">
          {formatPrice(price, currency)}
        </p>
        <a
          href="#contacto"
          className="mt-8 inline-flex items-center self-start rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-900 transition hover:bg-white/90"
        >
          Quiero información
        </a>
      </div>
    </section>
  )
}

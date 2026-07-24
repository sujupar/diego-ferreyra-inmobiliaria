/**
 * E1.7 — Hero cinematográfico premium.
 *
 * Foto a sangre completa con un settle sutil (Ken Burns muy leve), degradado
 * editorial y bloque de texto abajo-izquierda que entra escalonado (eyebrow →
 * título serif → dirección → precio → CTA). Indicador de scroll al pie.
 *
 * DISEÑO ROBUSTO: es un SERVER component y la animación es 100% CSS (clases
 * hero-rise/hero-zoom/hero-cue en globals.css). Por eso el contenido está
 * SIEMPRE visible (opacity por defecto 1) — nunca queda en blanco esperando el
 * JS, ni siquiera sin JavaScript. La animación se apaga sola con
 * prefers-reduced-motion. El título usa la serif editorial de `.landing-root`.
 */
import { ArrowRight, ChevronDown } from 'lucide-react'

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
    <section className="relative h-[92vh] min-h-[600px] w-full overflow-hidden">
      {heroImage ? (
        <>
          <div className="hero-zoom absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt={title}
              className="h-full w-full object-cover"
              fetchPriority="high"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80" />
          {/* Scrim inferior dedicado: garantiza contraste WCAG del texto (que
              está abajo) incluso sobre fotos claras (cielo, fachada blanca). */}
          <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
      )}

      <div className="relative mx-auto flex h-full max-w-5xl flex-col justify-end p-6 pb-16 text-white md:p-12 md:pb-20 lg:p-20 lg:pb-24">
        <p
          className="hero-rise text-[11px] font-medium uppercase tracking-[0.22em] text-white/90"
          style={{ animationDelay: '0.12s', textShadow: '0 1px 12px rgba(0,0,0,0.7)' }}
        >
          {OPERATION_LABEL[operationType] ?? operationType}
        </p>

        <h1
          className="hero-rise mt-4 text-4xl leading-[1.05] break-words md:text-6xl lg:text-7xl"
          style={{ animationDelay: '0.2s', textShadow: '0 2px 22px rgba(0,0,0,0.55)' }}
        >
          {title}
        </h1>

        <p
          className="hero-rise mt-4 text-base font-light break-words text-white/85 md:text-lg"
          style={{ animationDelay: '0.29s' }}
        >
          {address}, {neighborhood}, {city}
        </p>

        <p
          className="hero-rise mt-6 text-3xl font-light tabular-nums md:text-4xl"
          style={{ animationDelay: '0.38s' }}
        >
          {Number.isFinite(price) && price > 0 ? formatPrice(price, currency) : 'Precio a consultar'}
        </p>

        <div className="hero-rise mt-9" style={{ animationDelay: '0.47s' }}>
          <a
            href="#contacto"
            className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-slate-900 shadow-lg shadow-black/20 transition-all hover:gap-3 hover:shadow-xl"
          >
            Quiero información
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>

      {/* Indicador de scroll (bounce por CSS; se detiene con reduced-motion). */}
      <div
        className="hero-cue pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60"
        aria-hidden="true"
      >
        <ChevronDown className="h-6 w-6" />
      </div>
    </section>
  )
}

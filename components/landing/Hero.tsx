/**
 * E1.8 — Zona caliente (hero) de conversión.
 *
 * Dos layouts:
 *  - CON video (protagonista): titular → subtítulo → VIDEO → texto corto +
 *    precio → CTA. Fondo oscuro sobrio, centrado.
 *  - SIN video: foto a sangre completa cinematográfica, texto abajo-izquierda:
 *    eyebrow → titular → subtítulo → dirección → precio → CTA.
 *
 * El CTA abre el POPUP (CtaButton, no scrollea a un form). Robusto: server
 * component + animación CSS (clases hero-rise/hero-zoom) → contenido SIEMPRE
 * visible, sin JS, reduced-motion safe. Título con la serif de `.landing-root`.
 */
import { ChevronDown } from 'lucide-react'
import { CtaButton } from './CtaButton'

interface HeroProps {
  title: string
  subtitle?: string
  shortDesc?: string
  ctaLabel?: string
  address: string
  neighborhood: string
  city: string
  price: number
  currency: string
  operationType: string
  heroImage?: string
  videoUrl?: string | null
  videoFileUrl?: string | null
  mediaMode?: 'auto' | 'photo' | 'video'
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

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v') // ?v= en cualquier posición
      if (v) return `https://www.youtube.com/embed/${v}`
      const m = u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)
      if (m) return `https://www.youtube.com/embed/${m[1]}`
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
  } catch {
    /* url inválida → sin embed */
  }
  return null
}

export function LandingHero(props: HeroProps) {
  const {
    title, subtitle, shortDesc, // Mismo criterio que `CTA_RECORRIDO` en el registry: todos los CTA de la
    // landing prometen lo mismo. Este default solo aplica a documentos viejos.
    ctaLabel = 'Ver el recorrido de la propiedad',
    address, neighborhood, city, price, currency, operationType,
    heroImage, videoUrl, videoFileUrl, mediaMode = 'auto',
  } = props

  const priceStr =
    Number.isFinite(price) && price > 0 ? formatPrice(price, currency) : 'Precio a consultar'
  const operation = OPERATION_LABEL[operationType] ?? operationType
  const embedUrl = videoUrl ? toEmbedUrl(videoUrl) : null
  const hasVideo = mediaMode !== 'photo' && Boolean(videoFileUrl || embedUrl)

  // ── Layout CON video: el video es el protagonista ──────────────────────────
  if (hasVideo) {
    return (
      <section className="relative flex min-h-[92vh] w-full flex-col justify-center overflow-hidden bg-slate-950 px-6 py-16 text-white md:py-24">
        <div className="mx-auto w-full max-w-4xl text-center">
          <p className="hero-rise text-[11px] font-medium uppercase tracking-[0.22em] text-white/70" style={{ animationDelay: '0.1s' }}>
            {operation}
          </p>
          <h1 className="hero-rise mt-4 text-4xl leading-[1.08] break-words md:text-6xl" style={{ animationDelay: '0.18s' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="hero-rise mx-auto mt-4 max-w-2xl text-base font-light text-white/80 md:text-lg" style={{ animationDelay: '0.26s' }}>
              {subtitle}
            </p>
          )}
          <div className="hero-rise mt-8 aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl shadow-black/50" style={{ animationDelay: '0.34s' }}>
            {videoFileUrl ? (
              <video
                controls
                playsInline
                preload="metadata"
                poster={heroImage}
                src={videoFileUrl}
                className="h-full w-full"
              />
            ) : (
              <iframe
                src={embedUrl!}
                title={title}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            )}
          </div>
          <p className="hero-rise mt-6 text-sm text-white/70 md:text-base" style={{ animationDelay: '0.42s' }}>
            {shortDesc ? `${shortDesc} · ` : ''}
            <span className="font-medium text-white">{priceStr}</span>
          </p>
          <div className="hero-rise mt-8 flex justify-center" style={{ animationDelay: '0.5s' }}>
            <CtaButton label={ctaLabel} source="hero-video" variant="light" />
          </div>
        </div>
      </section>
    )
  }

  // ── Layout SIN video: foto cinematográfica a sangre completa ────────────────
  // min-h (no h fija): un titular muy largo hace crecer la sección en vez de
  // recortarse por arriba (overflow-hidden + justify-end). Finding review E1.8.
  return (
    <section className="relative min-h-[92vh] w-full overflow-hidden">
      {heroImage ? (
        <>
          <div className="hero-zoom absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt={title} className="h-full w-full object-cover" fetchPriority="high" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80" />
          <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
      )}

      <div className="relative mx-auto flex h-full max-w-5xl flex-col justify-end p-6 pb-16 text-white md:p-12 md:pb-20 lg:p-20 lg:pb-24">
        <p className="hero-rise text-[11px] font-medium uppercase tracking-[0.22em] text-white/90" style={{ animationDelay: '0.12s', textShadow: '0 1px 12px rgba(0,0,0,0.7)' }}>
          {operation}
        </p>
        <h1 className="hero-rise mt-4 text-4xl leading-[1.05] break-words md:text-6xl lg:text-7xl" style={{ animationDelay: '0.2s', textShadow: '0 2px 22px rgba(0,0,0,0.55)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="hero-rise mt-4 max-w-2xl text-lg font-light text-white/90 md:text-xl" style={{ animationDelay: '0.28s', textShadow: '0 1px 14px rgba(0,0,0,0.6)' }}>
            {subtitle}
          </p>
        )}
        <p className="hero-rise mt-3 text-sm font-light break-words text-white/80 md:text-base" style={{ animationDelay: '0.35s' }}>
          {shortDesc || `${address}, ${neighborhood}, ${city}`}
        </p>
        <p className="hero-rise mt-5 text-3xl font-light tabular-nums md:text-4xl" style={{ animationDelay: '0.42s' }}>
          {priceStr}
        </p>
        <div className="hero-rise mt-8" style={{ animationDelay: '0.5s' }}>
          <CtaButton label={ctaLabel} source="hero" variant="light" />
        </div>
      </div>

      <div className="hero-cue pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60" aria-hidden="true">
        <ChevronDown className="h-6 w-6" />
      </div>
    </section>
  )
}

/**
 * E1.9 — Hero de lujo (zona caliente). Centrado y editorial, al estilo de la
 * referencia Villa Eva pero con la marca DF. Dos layouts:
 *  - CON video: título → subtítulo → VIDEO protagonista → oferta → CTA.
 *  - SIN video: foto a sangre completa + veil + oferta centrada + CTA.
 *
 * ROBUSTO: server component + motion 100% CSS (clases hero-rise/hero-cue de
 * globals) → el contenido está SIEMPRE visible (nunca opacity:0 esperando JS),
 * y la animación se apaga con prefers-reduced-motion. Título con serif de lujo.
 */
import { ChevronDown } from 'lucide-react'
import { CtaButton } from '../CtaButton'

interface HeroLuxuryProps {
  title: string
  subtitle?: string
  offerLabel?: string
  price: number
  currency: string
  operationType: string
  neighborhood: string
  city: string
  specs: string[]
  ctaLabel?: string
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
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
      const m = u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)
      if (m) return `https://www.youtube.com/embed/${m[1]}`
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
  } catch {
    /* url inválida */
  }
  return null
}

function Wordmark() {
  return (
    <span
      className="lx-eyebrow absolute left-6 top-6 z-10 text-white md:left-10 md:top-8"
      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.55)' }}
    >
      Diego Ferreyra
    </span>
  )
}

export function HeroLuxury(props: HeroLuxuryProps) {
  const {
    title, subtitle, offerLabel = 'Precio', price, currency, operationType,
    neighborhood, city, specs, ctaLabel = 'Coordiná una visita',
    heroImage, videoUrl, videoFileUrl, mediaMode = 'auto',
  } = props

  const priceStr = Number.isFinite(price) && price > 0 ? formatPrice(price, currency) : 'Precio a consultar'
  const operation = OPERATION_LABEL[operationType] ?? operationType
  const location = [neighborhood, city].filter(Boolean).join(' · ')
  const embedUrl = videoUrl ? toEmbedUrl(videoUrl) : null
  const hasVideo = mediaMode !== 'photo' && Boolean(videoFileUrl || embedUrl)

  const Offer = ({ light }: { light: boolean }) => (
    <div className={`hero-rise flex flex-col items-center ${light ? 'text-white' : 'text-white'}`} style={{ animationDelay: '0.42s' }}>
      <span className="lx-eyebrow" style={{ color: 'rgba(255,255,255,0.72)', textShadow: '0 1px 10px rgba(0,0,0,0.6)' }}>
        {offerLabel}
      </span>
      <span
        className="mt-2 text-4xl font-medium tabular-nums md:text-5xl"
        style={{ fontFamily: 'var(--lx-serif)', textShadow: '0 2px 26px rgba(0,0,0,0.55)' }}
      >
        {priceStr}
      </span>
      {specs.length > 0 && (
        <span
          className="mt-3 text-xs uppercase tracking-[0.18em] text-white/85 md:text-sm"
          style={{ textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}
        >
          {specs.join('  ·  ')}
        </span>
      )}
    </div>
  )

  // ── CON video ───────────────────────────────────────────────────────────────
  if (hasVideo) {
    return (
      <section className="relative flex min-h-[92vh] w-full flex-col justify-center overflow-hidden bg-slate-950 px-6 py-20 text-white md:py-24">
        <Wordmark />
        <div className="mx-auto w-full max-w-4xl text-center">
          <p className="hero-rise lx-eyebrow text-white/70" style={{ animationDelay: '0.1s' }}>
            {operation}{location ? ` · ${location}` : ''}
          </p>
          <h1 className="hero-rise mt-4 text-4xl leading-[1.08] break-words md:text-6xl" style={{ animationDelay: '0.18s' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="hero-rise mx-auto mt-4 max-w-2xl text-base font-light text-white/80 md:text-lg" style={{ animationDelay: '0.26s' }}>
              {subtitle}
            </p>
          )}
          <div className="hero-rise mt-8 aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl shadow-black/50" style={{ animationDelay: '0.34s' }}>
            {videoFileUrl ? (
              <video controls playsInline preload="metadata" poster={heroImage} src={videoFileUrl} className="h-full w-full" />
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
          <div className="mt-8">
            <Offer light />
          </div>
          <div className="hero-rise mt-8 flex justify-center" style={{ animationDelay: '0.5s' }}>
            <CtaButton label={ctaLabel} source="hero-video" variant="light" />
          </div>
        </div>
      </section>
    )
  }

  // ── SIN video: foto cinematográfica centrada ─────────────────────────────────
  return (
    <section className="relative flex min-h-[92vh] w-full flex-col items-center justify-center overflow-hidden text-center">
      {heroImage ? (
        <>
          <div className="hero-zoom absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt={title} className="h-full w-full object-cover" fetchPriority="high" />
          </div>
          {/* Velo global reforzado en el centro (donde cae el copy) para contraste
              WCAG del texto blanco incluso sobre fotos claras. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/45 to-black/75" />
          <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          {/* Scrim de esquina detrás del wordmark (top-left brillante). */}
          <div
            className="pointer-events-none absolute left-0 top-0 z-[1] h-40 w-2/3 max-w-md bg-gradient-to-br from-black/55 via-black/20 to-transparent"
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
      )}
      <Wordmark />

      <div className="relative z-[2] flex flex-col items-center px-6 py-24 text-white">
        <p className="hero-rise lx-eyebrow text-white/85" style={{ animationDelay: '0.1s', textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}>
          {operation}
        </p>
        <h1 className="hero-rise mt-5 max-w-4xl text-5xl leading-[1.04] break-words md:text-7xl" style={{ animationDelay: '0.18s', textShadow: '0 2px 30px rgba(0,0,0,0.45)' }}>
          {title}
        </h1>
        {location && (
          <p className="hero-rise mt-5 text-xs uppercase tracking-[0.4em] text-white/80 md:text-sm" style={{ animationDelay: '0.26s', textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}>
            {location}
          </p>
        )}
        <div className="hero-rise mt-7 h-px w-14 bg-white/70" style={{ animationDelay: '0.34s' }} />
        {subtitle && (
          <p className="hero-rise mt-6 max-w-xl text-base font-light text-white/85 md:text-lg" style={{ animationDelay: '0.38s', textShadow: '0 1px 14px rgba(0,0,0,0.55)' }}>
            {subtitle}
          </p>
        )}
        <div className="mt-8">
          <Offer light />
        </div>
        <div className="hero-rise mt-9" style={{ animationDelay: '0.5s' }}>
          <CtaButton label={ctaLabel} source="hero" variant="light" />
        </div>
      </div>

      <div className="hero-cue pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60" aria-hidden="true">
        <ChevronDown className="h-6 w-6" />
      </div>
    </section>
  )
}

'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { ScrollReveal } from '@/components/funnel/ScrollReveal'
import { FunnelClickToPlayVideo } from '@/components/funnel/FunnelClickToPlayVideo'
import { TestimonialCard } from '@/components/funnel/TestimonialCard'
import { FunnelMetaPixel, trackFunnelConversion, getMetaCookie } from '@/components/funnel/FunnelMetaPixel'
import { FunnelHeatmapTracker } from '@/components/funnel/FunnelHeatmapTracker'
import { readAnonId } from '@/lib/funnel/anon-id'
import { readStoredAttribution } from '@/lib/funnel/attribution'
import type { FunnelLeadValues } from '@/components/funnel/FunnelLeadForm'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'
import { TASACION_CONTENT as C, BRAND } from '@/lib/funnel/content'

// El modal solo se necesita tras un click/hover del CTA → fuera del bundle inicial.
const FunnelLeadModal = dynamic(
  () => import('@/components/funnel/FunnelLeadModal').then((m) => m.FunnelLeadModal),
  { ssr: false },
)

function Cta({
  onClick,
  onPrime,
  label,
  note,
}: {
  onClick: () => void
  onPrime?: () => void
  label: string
  note?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onPrime}
        onFocus={onPrime}
        className="rounded-xl bg-[#00BF63] px-8 py-4 text-lg font-extrabold text-white shadow-xl transition hover:scale-[1.02] hover:brightness-95"
      >
        {label}
      </button>
      {note && <p className="text-sm text-[#777]">{note}</p>}
    </div>
  )
}

export function TasacionClient({
  testimonials,
  heroVideoUrl,
  heroPosterUrl,
  logoUrl,
  pixelId,
}: {
  testimonials: FunnelTestimonial[]
  heroVideoUrl: string
  heroPosterUrl: string
  logoUrl: string
  pixelId: string
}) {
  const [open, setOpen] = useState(false)
  // Precarga el chunk del modal en el primer gesto del CTA (hover/focus/click).
  const [modalReady, setModalReady] = useState(false)
  const prime = () => setModalReady(true)
  const openModal = () => {
    setModalReady(true)
    setOpen(true)
  }

  async function handleSubmit(values: FunnelLeadValues) {
    const eventId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const fbp = getMetaCookie('_fbp')
    const fbc = getMetaCookie('_fbc')
    const res = await fetch('/api/funnel/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        funnel: 'tasacion',
        name: values.name,
        email: values.email,
        phone: values.phone,
        propertyLocation: values.propertyLocation,
        company: values.company,
        eventId,
        eventSourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        fbp,
        fbc,
        anonId: readAnonId() || undefined,
        attribution: readStoredAttribution() ?? undefined,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string; deduplicated?: boolean; contactId?: string }
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'No pudimos procesar tu envío.')
    // Pixel SOLO si no fue un envío deduplicado (en dedup el CAPI no dispara → un Pixel solo inflaría la conversión)
    if (!data.deduplicated) trackFunnelConversion({ eventName: 'Lead', eventId, contentName: 'Tasación Directa' })
    if (data.redirect && typeof window !== 'undefined') window.location.href = data.redirect
  }

  return (
    <main>
      <FunnelMetaPixel pixelId={pixelId} contentName="Tasación Directa" />
      <FunnelHeatmapTracker page="tasacion" funnel="tasacion" />
      {/* Topbar */}
      <div data-hm="topbar" className="bg-[#0d2d49] py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">
        {C.topbar}
      </div>

      {/* Hero */}
      <section data-hm="hero" className="mx-auto max-w-4xl px-4 py-10 text-center">
        <Image src={logoUrl} alt="Diego Ferreyra" width={260} height={57} className="mx-auto mb-8 w-[240px]" style={{ height: 'auto' }} priority />
        <h1 className="font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold leading-tight text-[#0d2d49] md:text-5xl">
          {C.hero.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#555] md:text-lg">
          {C.hero.subhead}
        </p>
        <div className="mx-auto mt-8 max-w-3xl">
          <FunnelClickToPlayVideo
            src={heroVideoUrl}
            poster={heroPosterUrl}
            priority
            trackKey="hero-tasacion"
            funnel="tasacion"
            context="hero"
          />
        </div>
        <div className="mt-8">
          <Cta onClick={openModal} onPrime={prime} label={C.cta.label} note={C.cta.note} />
        </div>
      </section>

      {/* Benefits */}
      <section data-hm="benefits" className="bg-[#F8F9FA] py-14">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 md:grid-cols-3">
          {C.benefits.map((b, i) => (
            <ScrollReveal key={b.title} delay={i * 0.1}>
              <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                <h3 className="font-[family-name:var(--font-funnel-head)] text-lg font-bold text-[#0d2d49]">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#555]">{b.body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Stat band */}
      <section data-hm="stat" className="bg-[#0d2d49] py-16 text-center text-white">
        <ScrollReveal>
          <p className="font-[family-name:var(--font-funnel-head)] text-6xl font-extrabold text-[#00BF63] md:text-7xl">
            {C.stat.number}
          </p>
          <p className="mx-auto mt-4 max-w-2xl px-4 text-base text-white/90">{C.stat.body}</p>
        </ScrollReveal>
      </section>

      {/* Testimonios */}
      {testimonials.length > 0 && (
        <section data-hm="testimonios" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49] md:text-3xl">
            {C.testimonialsHeading}
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.key} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section data-hm="cta-final" className="bg-[#F8F9FA] py-16 text-center">
        <h2 className="mx-auto max-w-2xl px-4 font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49]">
          {C.finalHeading}
        </h2>
        <div className="mt-8">
          <Cta onClick={openModal} onPrime={prime} label={C.cta.label} />
        </div>
      </section>

      <footer data-hm="footer" className="bg-[#0d2d49] py-6 text-center text-xs text-white/70">
        © {new Date().getFullYear()} {BRAND.footer}
      </footer>

      {modalReady && (
        <FunnelLeadModal
          open={open}
          onClose={() => setOpen(false)}
          title={C.form.title}
          subtitle={C.form.subtitle}
          variant="tasacion"
          submitLabel={C.cta.label}
          onSubmit={handleSubmit}
        />
      )}
    </main>
  )
}

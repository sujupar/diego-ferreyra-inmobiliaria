'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ScrollReveal } from '@/components/funnel/ScrollReveal'
import { FunnelHeroVideo } from '@/components/funnel/FunnelHeroVideo'
import { TestimonialCard } from '@/components/funnel/TestimonialCard'
import { FunnelLeadModal } from '@/components/funnel/FunnelLeadModal'
import type { FunnelLeadValues } from '@/components/funnel/FunnelLeadForm'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'
import { TASACION_CONTENT as C, BRAND } from '@/lib/funnel/content'

function Cta({ onClick, label, note }: { onClick: () => void; label: string; note?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
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
  logoUrl,
}: {
  testimonials: FunnelTestimonial[]
  heroVideoUrl: string
  logoUrl: string
}) {
  const [open, setOpen] = useState(false)

  // Fase 2 reemplaza este stub por el POST real a /api/funnel/submit
  async function handleSubmit(_values: FunnelLeadValues) {
    await new Promise((r) => setTimeout(r, 400))
  }

  return (
    <main>
      {/* Topbar */}
      <div className="bg-[#0d2d49] py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">
        {C.topbar}
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-10 text-center">
        <Image src={logoUrl} alt="Diego Ferreyra" width={260} height={57} className="mx-auto mb-8 h-auto w-[240px]" priority />
        <h1 className="font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold leading-tight text-[#0d2d49] md:text-5xl">
          {C.hero.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#555] md:text-lg">
          {C.hero.subhead}
        </p>
        <div className="mx-auto mt-8 max-w-3xl">
          <FunnelHeroVideo src={heroVideoUrl} className="aspect-video" />
        </div>
        <div className="mt-8">
          <Cta onClick={() => setOpen(true)} label={C.cta.label} note={C.cta.note} />
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-[#F8F9FA] py-14">
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
      <section className="bg-[#0d2d49] py-16 text-center text-white">
        <ScrollReveal>
          <p className="font-[family-name:var(--font-funnel-head)] text-6xl font-extrabold text-[#00BF63] md:text-7xl">
            {C.stat.number}
          </p>
          <p className="mx-auto mt-4 max-w-2xl px-4 text-base text-white/90">{C.stat.body}</p>
        </ScrollReveal>
      </section>

      {/* Testimonios */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
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
      <section className="bg-[#F8F9FA] py-16 text-center">
        <h2 className="mx-auto max-w-2xl px-4 font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49]">
          {C.finalHeading}
        </h2>
        <div className="mt-8">
          <Cta onClick={() => setOpen(true)} label={C.cta.label} />
        </div>
      </section>

      <footer className="bg-[#0d2d49] py-6 text-center text-xs text-white/70">
        © {new Date().getFullYear()} {BRAND.footer}
      </footer>

      <FunnelLeadModal
        open={open}
        onClose={() => setOpen(false)}
        title={C.form.title}
        subtitle={C.form.subtitle}
        variant="tasacion"
        submitLabel={C.cta.label}
        onSubmit={handleSubmit}
      />
    </main>
  )
}

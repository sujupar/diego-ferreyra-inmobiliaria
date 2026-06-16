'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ScrollReveal } from '@/components/funnel/ScrollReveal'
import { FunnelHeroVideo } from '@/components/funnel/FunnelHeroVideo'
import { TestimonialCard } from '@/components/funnel/TestimonialCard'
import { FunnelLeadModal } from '@/components/funnel/FunnelLeadModal'
import type { FunnelLeadValues } from '@/components/funnel/FunnelLeadForm'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'
import { CLASE_CONTENT as C, BRAND } from '@/lib/funnel/content'

function Cta({ onClick, label, note }: { onClick: () => void; label: string; note?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl bg-[#00BF63] px-10 py-4 text-lg font-extrabold text-white shadow-xl transition hover:scale-[1.02] hover:brightness-95"
      >
        {label}
      </button>
      {note && <p className="text-sm text-[#777]">{note}</p>}
    </div>
  )
}

export function ClaseClient({
  testimonials,
  vslUrl,
  vslPoster,
  headshotUrl,
}: {
  testimonials: FunnelTestimonial[]
  vslUrl: string
  vslPoster: string
  headshotUrl: string
}) {
  const [open, setOpen] = useState(false)

  async function handleSubmit(values: FunnelLeadValues) {
    const eventId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await fetch('/api/funnel/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        funnel: 'clase',
        name: values.name,
        email: values.email,
        phone: values.phone,
        tipoCliente: values.tipoCliente,
        company: values.company,
        eventId,
        eventSourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string }
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'No pudimos procesar tu envío.')
    if (data.redirect && typeof window !== 'undefined') window.location.href = data.redirect
  }

  return (
    <main>
      <div className="bg-[#0d2d49] py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">
        {C.topbar}
      </div>

      <section className="mx-auto max-w-4xl px-4 py-10 text-center">
        <span className="inline-block rounded-full bg-[#00BF63]/15 px-4 py-1 text-sm font-bold uppercase tracking-wide text-[#00BF63]">
          {C.badge}
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold leading-tight text-[#0d2d49] md:text-5xl">
          {C.hero.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#555] md:text-lg">
          {C.hero.subhead}
        </p>
        <div className="mx-auto mt-8 max-w-3xl">
          <FunnelHeroVideo src={vslUrl} poster={vslPoster} className="aspect-video" />
        </div>
        <div className="mt-8">
          <Cta onClick={() => setOpen(true)} label={C.cta.label} note={C.cta.note} />
        </div>
      </section>

      {testimonials.length > 0 && (
        <section className="bg-[#F8F9FA] py-16">
          <h2 className="mx-auto max-w-3xl px-4 text-center font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49] md:text-3xl">
            {C.socialProofHeading}
          </h2>
          <div className="mx-auto mt-10 grid max-w-6xl gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.key} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* ¿Quién soy? */}
      <section className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 py-16 md:flex-row">
        <Image
          src={headshotUrl}
          alt={C.bio.name}
          width={220}
          height={220}
          className="h-44 w-44 shrink-0 rounded-full object-cover shadow-lg ring-4 ring-[#00BF63]/20"
        />
        <div>
          <h2 className="font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49]">
            {C.bio.heading}
          </h2>
          <p className="mt-1 text-lg font-bold text-[#0d2d49]">{C.bio.name}</p>
          <p className="text-sm text-[#777]">{C.bio.role}</p>
        </div>
      </section>

      <section className="bg-[#0d2d49] py-16 text-center">
        <ScrollReveal>
          <div className="px-4">
            <Cta onClick={() => setOpen(true)} label={C.cta.label} note={C.cta.note} />
          </div>
        </ScrollReveal>
      </section>

      <footer className="bg-[#0d2d49] py-6 text-center text-xs text-white/70">
        © {new Date().getFullYear()} {BRAND.footer}
      </footer>

      <FunnelLeadModal
        open={open}
        onClose={() => setOpen(false)}
        title={C.form.heading}
        subtitle={C.form.subtitle}
        variant="clase"
        submitLabel={C.form.submitLabel}
        tipoClienteLabel={C.form.tipoClienteLabel}
        tipoClienteOptions={C.form.tipoClienteOptions}
        onSubmit={handleSubmit}
      />
    </main>
  )
}

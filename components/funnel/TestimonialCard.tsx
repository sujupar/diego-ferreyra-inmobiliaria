'use client'

import { useState } from 'react'
import Image from 'next/image'
import { TestimonialLightbox } from './TestimonialLightbox'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'

export function TestimonialCard({ t }: { t: FunnelTestimonial }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(13,45,73,0.10)] ring-1 ring-black/5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver video testimonio de ${t.clientName}`}
        className="group relative aspect-[4/5] w-full overflow-hidden"
      >
        <Image
          src={t.posterUrl}
          alt={`Testimonio de ${t.clientName}`}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-2xl text-[#0d2d49] shadow-lg transition group-hover:scale-110">
            ▶
          </span>
        </span>
        {t.resultBadge && (
          <span className="absolute left-3 top-3 rounded-full bg-[#00BF63] px-3 py-1 text-xs font-bold text-white shadow">
            {t.resultBadge}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-[family-name:var(--font-funnel-head)] text-lg font-bold text-[#0d2d49]">
          {t.title}
        </h3>
        <p className="flex-1 text-sm leading-relaxed text-[#555]">“{t.quote}”</p>
        <p className="text-sm font-bold text-[#0d2d49]">
          {t.clientName}, <span className="font-normal text-[#777]">{t.location}</span>
        </p>
      </div>
      {open && (
        <TestimonialLightbox
          videoUrl={t.videoUrl}
          clientName={t.clientName}
          onClose={() => setOpen(false)}
        />
      )}
    </article>
  )
}

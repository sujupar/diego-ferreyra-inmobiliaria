'use client'

/**
 * La página del video de bienvenida (change tasacion-video-bienvenida, D4). La arma
 * `app/t/[codigo]/page.tsx` con datos planos: este componente no lee la base.
 *
 * - "Qué pasa ahora" aparece recién a los 30 segundos de video reproducido (adelantar no
 *   suma), o desde el principio si ya los había visto en otra visita.
 * - La apertura se registra desde el navegador, una vez por pestaña: así la vista previa que
 *   arma WhatsApp (que no ejecuta JS) no cuenta como "lo abrió".
 * - Con `medir=false` (alguien del equipo) no registra nada y el bloque se ve siempre.
 */
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { FunnelClickToPlayVideo } from '@/components/funnel/FunnelClickToPlayVideo'
import { TestimonialCard } from '@/components/funnel/TestimonialCard'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'
import { CONTENIDO } from '@/lib/video-bienvenida/contenido'
import { mostrarQuePasaAhora, UMBRAL_SEGUNDOS } from '@/lib/video-bienvenida/mostrar-bloque'

export interface PaginaVideoProps {
  codigo: string
  titular: string
  medir: boolean
  segundosPrevios: number
  /** Testimonios reales (`funnel_testimonials`). Sin ellos la sección no se muestra. */
  testimonios?: FunnelTestimonial[]
}

export function PaginaVideo({ codigo, titular, medir, segundosPrevios, testimonios = [] }: PaginaVideoProps) {
  const [segundos, setSegundos] = useState(0)
  const visible = !medir || mostrarQuePasaAhora({ segundosEnEstaVisita: segundos, segundosPrevios })

  useEffect(() => {
    if (!medir) return
    const marca = `bv-apertura:${codigo}`
    try {
      if (sessionStorage.getItem(marca)) return
      sessionStorage.setItem(marca, '1')
    } catch {
      /* sin sessionStorage (modo privado viejo): se cuenta igual */
    }
    void fetch(`/api/public/video/${codigo}`, { method: 'POST', keepalive: true }).catch(() => {})
  }, [codigo, medir])

  const c = CONTENIDO
  const orden = c.referencias.orden as readonly string[]
  const referencias = [...testimonios]
    .filter((t) => orden.includes(t.key))
    .sort((a, b) => orden.indexOf(a.key) - orden.indexOf(b.key))
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F8F9FA] font-[family-name:var(--font-funnel-body)] text-[#152238]">
      {!medir && (
        <p className="bg-[#FFF4CC] px-4 py-2 text-center text-[13px] text-[#5c4a00]">{c.avisoEquipo}</p>
      )}

      <header className="flex justify-center border-b border-[#E3E6EA] bg-white px-5 py-4">
        <Image src={c.logo} alt="Diego Ferreyra, Martillero Público" width={240} height={53} priority className="h-auto w-[190px] sm:w-[240px]" />
      </header>

      <main className="mx-auto flex w-full max-w-[960px] flex-col items-center gap-6 px-0 pt-7 sm:gap-7 sm:px-5 sm:pt-12">
        <div className="flex max-w-[760px] flex-col items-center gap-3.5 px-5 text-center sm:px-0">
          <h1 className="m-0 text-balance font-[family-name:var(--font-funnel-head)] text-[30px] font-extrabold leading-[1.12] text-[#0d2d49] sm:text-[44px] sm:leading-[1.08]">
            {titular}
          </h1>
          <p className="m-0 text-[17px] leading-relaxed text-[#4A5561] sm:text-[19px]">{c.subtitulo}</p>
        </div>

        <div className="w-full sm:overflow-hidden sm:rounded-[14px] sm:shadow-[0_10px_30px_rgba(13,45,73,0.18)]">
          <FunnelClickToPlayVideo
            src={c.video.src}
            poster={c.video.poster}
            priority
            warmup
            vslBar
            context="bienvenida"
            anonId={`bv:${codigo}`}
            trackKey={medir ? c.video.trackKey : undefined}
            // Pasados los 30 s el bloque ya está: dejar de actualizar evita redibujar la página
            // durante los 13 minutos de video (auditoría de código, hallazgo 5).
            onSegundosReproducidos={(n) => setSegundos((p) => (p + segundosPrevios >= UMBRAL_SEGUNDOS ? p : n))}
            className="rounded-none! sm:rounded-[14px]!"
          />
        </div>

        {visible && (
          <section
            aria-live="polite"
            className="mx-5 flex w-auto max-w-[640px] flex-col items-center gap-3 rounded-[14px] border border-[#E3E6EA] bg-white px-5 py-6 text-center shadow-[0_8px_24px_rgba(13,45,73,0.10)] motion-safe:animate-[bv-aparecer_300ms_ease-out] sm:mx-0 sm:w-full sm:px-7"
          >
            <h2 className="m-0 font-[family-name:var(--font-funnel-head)] text-[20px] font-bold text-[#0d2d49] sm:text-[22px]">
              {c.quePasaAhora.titulo}
            </h2>
            <p className="m-0 text-base leading-relaxed text-[#4A5561]">{c.quePasaAhora.texto}</p>
            <p className="m-0 whitespace-nowrap font-[family-name:var(--font-funnel-head)] text-[24px] font-bold sm:text-[26px]">
              {c.paula.telefonoVisible}
            </p>
            <p className="m-0 text-[15px] leading-relaxed text-[#555]">{c.quePasaAhora.nota}</p>
            <a
              href="/t/paula.vcf"
              className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] bg-[#0d2d49] font-[family-name:var(--font-funnel-head)] text-[15px] font-bold text-white no-underline sm:w-auto sm:px-6"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="8" r="4" />
                <path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
                <path d="M19 8v6" />
                <path d="M16 11h6" />
              </svg>
              {c.quePasaAhora.boton}
            </a>
          </section>
        )}

        <section className="flex w-full max-w-[760px] flex-col items-center gap-5 px-5 pt-4 sm:px-0">
          <h2 className="m-0 text-center font-[family-name:var(--font-funnel-head)] text-[24px] font-extrabold text-[#0d2d49] sm:text-[30px]">
            {c.valor.titulo}
          </h2>
          <ol className="m-0 flex w-full list-none flex-col gap-3 p-0">
            {c.valor.items.map((it, i) => (
              <li key={it.titulo} className="flex items-start gap-4 rounded-[14px] border border-[#E3E6EA] bg-white px-5 py-4 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0d2d49] font-[family-name:var(--font-funnel-head)] text-[16px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-[family-name:var(--font-funnel-head)] text-[17px] font-bold text-[#0d2d49]">{it.titulo}</span>
                  <span className="text-[15px] leading-relaxed text-[#4A5561]">{it.texto}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {referencias.length > 0 && (
          <section className="flex w-full flex-col items-center gap-5 px-5 pt-4 sm:px-0">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <h2 className="m-0 font-[family-name:var(--font-funnel-head)] text-[24px] font-extrabold text-[#0d2d49] sm:text-[30px]">
                {c.referencias.titulo}
              </h2>
              <p className="m-0 text-[15px] text-[#555]">{c.referencias.bajada}</p>
            </div>
            <div className="grid w-full gap-6 sm:grid-cols-3">
              {referencias.map((t) => (
                <div key={t.key} className="flex flex-col gap-2">
                  {c.referencias.miedo[t.key] && (
                    <p className="m-0 text-center text-[14px] font-bold uppercase tracking-wide text-[#b42318]">
                      {c.referencias.miedo[t.key]}
                    </p>
                  )}
                  <TestimonialCard t={t} />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-5 px-5">
          <div className="flex items-center gap-3">
            <Image src="/social/diego/diego-head.png" alt="Diego Ferreyra" width={52} height={52} className="h-[46px] w-[46px] rounded-full bg-[#DEE2E6] object-cover sm:h-[52px] sm:w-[52px]" />
            <div className="flex flex-col gap-0.5 text-left">
              <span className="text-base font-bold">{c.firma.titulo}</span>
              <span className="text-sm text-[#555]">{c.firma.bajada}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2.5">
            <span className="text-[15px] text-[#555]">{c.whatsapp.pregunta}</span>
            <a
              href={c.whatsapp.url}
              className="flex h-11 items-center gap-2 rounded-full border-[1.5px] border-[#1da851] px-[18px] text-[15px] font-bold text-[#13803d] no-underline"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12z" />
              </svg>
              {c.whatsapp.boton}
            </a>
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-[#E3E6EA] px-5 py-7 text-center text-[13px] text-[#555]">{c.pie}</footer>
    </div>
  )
}

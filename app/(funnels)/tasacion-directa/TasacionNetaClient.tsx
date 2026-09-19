'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { FunnelClickToPlayVideo } from '@/components/funnel/FunnelClickToPlayVideo'
import { TestimonialCard } from '@/components/funnel/TestimonialCard'
import { FunnelMetaPixel, trackFunnelConversion, getMetaCookie } from '@/components/funnel/FunnelMetaPixel'
import { FunnelHeatmapTracker } from '@/components/funnel/FunnelHeatmapTracker'
import { HeatmapOverlay } from '@/components/funnel/HeatmapOverlay'
import { readAnonId } from '@/lib/funnel/anon-id'
import { readStoredAttribution } from '@/lib/funnel/attribution'
import type { FunnelLeadValues } from '@/components/funnel/FunnelLeadForm'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'
import { TASACION_B_CONTENT as C, BRAND } from '@/lib/funnel/content'

const FunnelLeadModal = dynamic(
  () => import('@/components/funnel/FunnelLeadModal').then((m) => m.FunnelLeadModal),
  { ssr: false },
)

/**
 * Botón verde de la landing B.
 *
 * VA A NIVEL DE MÓDULO, NO ADENTRO DE `TasacionNetaClient` — y no es prolijidad.
 * Un componente declarado dentro del render es un TIPO NUEVO en cada render. Acá
 * el primer gesto sobre el botón llama a `onPrime`, que cambia un estado de la
 * landing; la landing se vuelve a dibujar, React ve "otro" componente y DESTRUYE
 * el botón para montar uno nuevo… en pleno toque. El clic cae sobre un nodo que
 * ya no está en la página y se pierde. En compu no se nota (el hover precarga
 * antes del clic); en celular el primer toque no abría el formulario.
 * Estuvo así en producción del 15 al 19/9/2026: 59 visitas a la B (86% desde
 * celular) y 0 registros reales. La prueba que lo clava está al lado
 * (`TasacionNetaClient.test.tsx`); la variante A siempre lo tuvo afuera.
 */
function Cta({
  onClick,
  onPrime,
  label,
  note,
}: {
  onClick: () => void
  onPrime: () => void
  label: string
  note: string
}) {
  return (
    <div className="mt-7 flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onPrime}
        onFocus={onPrime}
        className="w-full max-w-[520px] rounded-xl bg-[#00BF63] px-6 py-5 font-[family-name:var(--font-funnel-head)] text-base font-extrabold tracking-wide text-white shadow-[0_12px_30px_-10px_rgba(0,191,99,.65)] transition hover:-translate-y-px hover:bg-[#00A857] md:text-lg"
      >
        {label}
      </button>
      <p className="text-sm text-[#7C8794]">{note}</p>
    </div>
  )
}

/**
 * Variante B de la landing de tasación — "La Tasación Neta".
 *
 * Emula una VSL de dos pasos: el video es el centro de la página y todo lo demás
 * existe para sostenerlo. Por eso NO hay bloque de beneficios ni lista de lo que
 * incluye: la oferta se cuenta en el video (decisión del dueño, 2026-09-03).
 *
 * El flujo de conversión es EXACTAMENTE el mismo de la variante A —mismo modal,
 * mismo endpoint, mismo evento CompleteRegistration— más el campo `landingVariant`,
 * que es lo único que las distingue en el CRM. Si esto se desalinea de
 * TasacionClient.tsx, el A/B deja de comparar dos landings y pasa a comparar dos
 * embudos distintos.
 */
export function TasacionNetaClient({
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
        // Lo único que distingue a esta landing de la A en el CRM.
        landingVariant: 'B',
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean; redirect?: string; error?: string; deduplicated?: boolean
    }
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'No pudimos procesar tu envío.')
    // Mismo criterio que la variante A: sin Pixel en un envío deduplicado (el
    // CAPI no dispara y un Pixel solo inflaría la conversión), y el evento es
    // CompleteRegistration porque los adsets optimizan por eso.
    if (!data.deduplicated) {
      trackFunnelConversion({ eventName: 'CompleteRegistration', eventId, contentName: 'Tasación Neta' })
    }
    if (data.redirect && typeof window !== 'undefined') window.location.href = data.redirect
  }

  const credit = C.hero.credit.split('{antes}')
  const creditTail = credit[1]?.split('{despues}') ?? ['', '']

  return (
    <main className="bg-white text-center">
      <FunnelMetaPixel pixelId={pixelId} contentName="Tasación Neta" />
      <FunnelHeatmapTracker page="tasacion-neta" funnel="tasacion" />
      <HeatmapOverlay />

      <div data-hm="logo" className="px-5 pb-1 pt-8">
        <Image src={logoUrl} alt="Diego Ferreyra Inmobiliaria" width={250} height={55}
          className="mx-auto w-[250px] max-w-[64vw]" style={{ height: 'auto' }} priority />
      </div>

      <div className="mx-auto max-w-[1000px] px-5">
        <section className="pt-6">
          {/* La sección "hero" del mapa de calor envuelve SOLO el título y el texto. Hasta el 2026-09-19
              estaba en el <section> y envolvía también al video, al recuadro y al
              botón, que son secciones propias: una sección adentro de otra. El
              bloque entero mide varias pantallas en celular, así que casi nadie
              "llegaba" al hero (72% contra 90% en la A) y la caída hero → video del
              panel no significaba nada, porque el video estaba ADENTRO del hero.
              Este <div> no tiene clases a propósito: no cambia nada de lo que se ve. */}
          <div data-hm="hero">
            <p className="mx-auto mb-4 max-w-[640px] text-[.82rem] font-bold uppercase leading-snug tracking-[.06em] text-[#084898] md:text-sm">
              {C.hero.kicker}
            </p>
            <h1 className="font-[family-name:var(--font-funnel-head)] text-[1.78rem] font-black leading-[1.14] tracking-[-.022em] text-[#152238] md:text-[3.1rem]">
              {C.hero.headlineA}
              <br />
              Es <span className="text-[#084898]">{C.hero.highlight}</span>{' '}
              {C.hero.headlineB.replace(`Es ${C.hero.highlight} `, '')}
            </h1>

            <p className="mx-auto mt-5 max-w-[760px] text-base leading-relaxed text-[#4A5561] md:text-lg">
              {C.hero.subhead}
            </p>

            <p className="mx-auto mt-5 max-w-[760px] rounded-[10px] border border-[#E3E6EA] bg-[#F6F8F9] px-5 py-4 text-[.95rem] leading-relaxed text-[#4A5561] md:text-base">
              {credit[0]}
              <b className="font-bold text-[#152238]">{C.hero.heroAmountBefore}</b>
              {creditTail[0]}
              <span className="whitespace-nowrap font-bold text-[#084898]">{C.hero.heroAmountAfter}</span>
              {creditTail[1]}
            </p>
          </div>

          <div data-hm="video" className="mt-7">
            {/* `warmup` y `vslBar` van SOLO acá: el reproductor lo comparten la
                variante A, la clase y gracias-clase, y la A es el control de este
                mismo experimento. Cambiarle el comportamiento por defecto sería
                mover las dos patas de la comparación a la vez. */}
            <FunnelClickToPlayVideo
              src={heroVideoUrl}
              poster={heroPosterUrl}
              priority
              // Clave PROPIA de la B. Hasta el 2026-09-19 decía "hero-tasacion", la
              // misma de la variante A: dos videos distintos (196 s y 711 s) con sus
              // estadísticas mezcladas en un solo bloque de Embudos. El catálogo y la
              // prueba que impide repetirla están en `lib/funnel/video-keys.ts`.
              trackKey="hero-tasacion-neta"
              funnel="tasacion"
              context="hero"
              warmup
              vslBar
            />
          </div>

          <div data-hm="qualifier" className="mx-auto mt-6 max-w-[680px] rounded-r-lg border-l-[3px] border-[#084898] bg-[#F6F8F9] px-5 py-4 text-left">
            <p className="text-[.95rem] leading-relaxed text-[#4A5561]">
              <b className="font-bold text-[#152238]">{C.qualifier.lead}</b> {C.qualifier.body}
            </p>
          </div>

          <div data-hm="cta-1">
            <Cta onClick={openModal} onPrime={prime} label={C.cta.label} note={C.cta.note} />
          </div>
        </section>

        {testimonials.length > 0 && (
          <section data-hm="testimonios" className="pt-16">
            <h2 className="font-[family-name:var(--font-funnel-head)] text-lg font-extrabold uppercase tracking-wider text-[#152238] md:text-2xl">
              {C.testimonialsHeading}
            </h2>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <TestimonialCard key={t.key} t={t} />
              ))}
            </div>
          </section>
        )}

        <section data-hm="cta-final" className="pt-16">
          <h2 className="mx-auto max-w-[760px] font-[family-name:var(--font-funnel-head)] text-[1.32rem] font-extrabold leading-tight tracking-[-.015em] text-[#152238] md:text-[2rem]">
            {C.finalHeading}
          </h2>
          <Cta onClick={openModal} onPrime={prime} label={C.cta.label} note={C.cta.noteShort} />
        </section>
      </div>

      <footer data-hm="footer" className="mt-16 border-t border-[#E3E6EA] px-5 pb-11 pt-7 text-[.79rem] leading-relaxed text-[#7C8794]">
        <div className="font-[family-name:var(--font-funnel-head)] font-extrabold tracking-wider text-[#152238]">
          DIEGO FERREYRA INMOBILIARIA
        </div>
        <div>Martillero Público · CUCICBA 8266</div>
        <div>© {new Date().getFullYear()} {BRAND.footer}</div>
      </footer>

      {modalReady && (
        <FunnelLeadModal
          open={open}
          onClose={() => setOpen(false)}
          title={C.form.title}
          subtitle={C.form.subtitle}
          variant="tasacion"
          submitLabel={C.form.submitLabel}
          whatsappCta
          footnote={C.form.footnote}
          onSubmit={handleSubmit}
        />
      )}
    </main>
  )
}

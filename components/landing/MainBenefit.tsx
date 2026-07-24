/**
 * E1.8 — Beneficio principal destacado: declaración grande, centrada, con fondo
 * de marca sobrio. Server component. (El CTA va en un bloque `cta` aparte.)
 */
export function LandingMainBenefit({ headline, body }: { headline: string; body?: string }) {
  return (
    <section className="bg-[color:var(--brand)] px-6 py-20 text-center text-[color:var(--brand-foreground)] md:py-28">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl leading-tight md:text-5xl">{headline}</h2>
        {body && (
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed opacity-90 md:text-lg">
            {body}
          </p>
        )}
      </div>
    </section>
  )
}

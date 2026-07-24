/**
 * E1.8 — Banda de CTA distribuida (abre el popup). Se usa 2-3 veces bajando la
 * página para que la persona no tenga que volver a subir. Server component que
 * renderiza el CtaButton (client). El copy motiva el clic.
 */
import { CtaButton } from './CtaButton'

export function LandingCtaBand({
  label,
  headline,
  subtext,
  source,
}: {
  label: string
  headline?: string
  subtext?: string
  source?: string
}) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center md:px-12 md:py-20 lg:px-20">
      {headline && <h2 className="text-2xl md:text-4xl">{headline}</h2>}
      {subtext && (
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          {subtext}
        </p>
      )}
      <div className="mt-8 flex justify-center">
        <CtaButton label={label} source={source} variant="brand" />
      </div>
    </section>
  )
}

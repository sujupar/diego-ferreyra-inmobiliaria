/**
 * E1.9 — Invitación de cierre (de MARCA, sin asesor) + CTA que abre el popup.
 * Server component; el CtaButton (client) usa el contexto del provider.
 */
import { CtaButton } from '../CtaButton'

interface ClosingInviteProps {
  eyebrow?: string
  headline: string
  body?: string
  ctaLabel?: string
  source?: string
}

export function ClosingInvite({
  eyebrow,
  headline,
  body,
  ctaLabel = 'Ver el recorrido de la propiedad',
  source = 'closing',
}: ClosingInviteProps) {
  return (
    <section
      className="lx-reveal border-t px-6 py-24 text-center md:py-32"
      style={{ borderColor: 'var(--lx-line)', background: 'var(--lx-bg-2)' }}
    >
      <div className="mx-auto max-w-2xl">
        {eyebrow && <p className="lx-eyebrow">{eyebrow}</p>}
        <h2 className="mt-4 text-3xl leading-tight md:text-5xl">{headline}</h2>
        {body && (
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed md:text-lg" style={{ color: 'var(--lx-ink-soft)' }}>
            {body}
          </p>
        )}
        <div className="mt-9 flex justify-center">
          <CtaButton label={ctaLabel} source={source} variant="brand" />
        </div>
      </div>
    </section>
  )
}

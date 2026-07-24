/**
 * E1.2 — Barra de prueba social (elemento de conversión).
 *
 * Una landing de conversión (no portal) necesita prueba social above-the-fold:
 * matrícula CUCICBA, años de trayectoria, señales de confianza. Este bloque la
 * materializa. Los ítems son editables; el default incluye la matrícula real.
 */
interface ProofBarProps {
  items?: string[]
}

const DEFAULT_ITEMS = [
  'Matriculado CUCICBA 8266',
  'Tasación profesional sin cargo',
  'Atención personalizada',
]

export function LandingProofBar({ items }: ProofBarProps) {
  const list = items && items.length > 0 ? items : DEFAULT_ITEMS
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="max-w-5xl mx-auto px-6 md:px-12 lg:px-20 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
        {list.map((item, i) => (
          <span key={i} className="flex items-center gap-2">
            <span aria-hidden className="text-[color:var(--brand,currentColor)]">✓</span>
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}

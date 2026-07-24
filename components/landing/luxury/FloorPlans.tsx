/**
 * E1.9 — Planos (condicional: solo si la propiedad tiene planos cargados).
 * Grilla con marco desplazado, imagen SIN recortar (object-contain sobre blanco)
 * + etiqueta; al tocar, abre el plano completo en una pestaña nueva. Server
 * component (los planos no necesitan lightbox: full-res en pestaña aparte).
 */
import { FileText } from 'lucide-react'

interface PlanItem {
  src: string
  label: string
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split('?')[0].endsWith('.pdf')
}

export function FloorPlans({ plans, title }: { plans: PlanItem[]; title?: string }) {
  if (!plans?.length) return null
  return (
    <section
      className="lx-reveal border-t px-6 py-20 md:px-12 md:py-28 lg:px-16"
      style={{ borderColor: 'var(--lx-line)', background: 'var(--lx-bg)' }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center md:mb-14">
          <p className="lx-eyebrow">Planos</p>
          {title && <h2 className="mt-3 text-3xl md:text-5xl">{title}</h2>}
        </div>
        <div className="grid gap-10 md:grid-cols-2">
          {plans.map((p, i) => (
            <div key={i}>
              <a
                href={p.src}
                target="_blank"
                rel="noopener"
                className="lx-frame block bg-white"
                aria-label={`Ver plano: ${p.label}`}
              >
                {isPdfUrl(p.src) ? (
                  // Los planos pueden ser PDF: mostramos una tarjeta de documento
                  // (un <img> a un .pdf saldría roto).
                  <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 bg-white p-4 text-center">
                    <FileText className="h-14 w-14" style={{ color: 'var(--lx-navy)' }} />
                    <span className="lx-eyebrow" style={{ color: 'var(--lx-ink-soft)' }}>
                      Abrir plano (PDF)
                    </span>
                  </div>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.src}
                      alt={p.label}
                      loading="lazy"
                      className="aspect-[4/3] w-full bg-white object-contain p-4 transition-transform duration-500 hover:scale-[1.02]"
                    />
                  </>
                )}
              </a>
              {p.label && (
                <p className="lx-eyebrow mt-5 text-center" style={{ color: 'var(--lx-ink-soft)' }}>
                  {p.label}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

'use client'

/**
 * E1.8 — Botón CTA que abre el popup de captura (no scrollea a un form).
 * Es client para poder llamar a useLeadCapture().open(); vive dentro del
 * LeadCaptureProvider (aunque lo envuelvan server components).
 */
import { ArrowRight } from 'lucide-react'
import { useLeadCapture } from './LeadCaptureProvider'

interface CtaButtonProps {
  label: string
  /** De dónde salió el clic (se guarda en el lead: hero / cta-mid / cta-final). */
  source?: string
  variant?: 'light' | 'brand'
  className?: string
}

export function CtaButton({ label, source, variant = 'brand', className = '' }: CtaButtonProps) {
  const { open } = useLeadCapture()
  const base =
    'group inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium shadow-lg transition-all hover:gap-3'
  const styles =
    variant === 'light'
      ? 'bg-white text-slate-900 shadow-black/20 hover:shadow-xl'
      : 'bg-[color:var(--brand)] text-white shadow-black/10 hover:opacity-95'
  return (
    <button type="button" onClick={() => open(source)} className={`${base} ${styles} ${className}`}>
      {label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

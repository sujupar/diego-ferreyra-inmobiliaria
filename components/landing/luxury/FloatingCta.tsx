'use client'

/**
 * E1.9 — Botón flotante que aparece al bajar (para no volver a subir a clickear)
 * y abre el popup. Es una MEJORA (no contenido): el hero y el cierre ya tienen
 * CTAs siempre visibles, así que está bien que este dependa del JS/scroll.
 * Vive dentro del LeadCaptureProvider (usa su contexto).
 */
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useLeadCapture } from '../LeadCaptureProvider'

export function FloatingCta({ label = 'Coordiná una visita' }: { label?: string }) {
  const { open } = useLeadCapture()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.7)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      type="button"
      onClick={() => open('floating')}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[11px] font-medium uppercase tracking-[0.18em] text-white shadow-xl shadow-black/20 transition-all duration-300 hover:gap-3 motion-reduce:transition-none ${
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
      style={{ background: 'var(--brand)' }}
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </button>
  )
}

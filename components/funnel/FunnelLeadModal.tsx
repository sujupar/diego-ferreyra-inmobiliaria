'use client'

import { useEffect, useRef } from 'react'
import { FunnelLeadForm, type FunnelLeadValues } from './FunnelLeadForm'

interface FunnelLeadModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  variant: 'tasacion' | 'clase'
  submitLabel: string
  tipoClienteLabel?: string
  tipoClienteOptions?: readonly string[]
  onSubmit: (values: FunnelLeadValues) => Promise<void>
}

export function FunnelLeadModal(props: FunnelLeadModalProps) {
  const { open, onClose, title, subtitle } = props
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar formulario"
          className="absolute right-4 top-4 text-xl text-[#999]"
        >
          ✕
        </button>
        <h2 className="font-[family-name:var(--font-funnel-head)] text-xl font-bold text-[#0d2d49]">
          {title}
        </h2>
        <p className="mb-4 mt-1 text-sm text-[#555]">{subtitle}</p>
        <FunnelLeadForm
          variant={props.variant}
          submitLabel={props.submitLabel}
          tipoClienteLabel={props.tipoClienteLabel}
          tipoClienteOptions={props.tipoClienteOptions}
          onSubmit={props.onSubmit}
        />
      </div>
    </div>
  )
}

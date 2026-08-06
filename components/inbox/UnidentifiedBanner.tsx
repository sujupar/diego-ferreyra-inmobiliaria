'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'

/**
 * Cartel del inicio: aparece SOLO si hay avisos sin identificar. Es la única
 * vía por la que la coordinadora se entera de que hay trabajo pendiente
 * (decisión del usuario: nada de WhatsApp ni emails nuevos).
 */
export function UnidentifiedBanner() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/portal-inquiries/unidentified')
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => { if (!cancelled) setCount((data ?? []).length) })
      .catch(() => { /* silencioso: el cartel es informativo, no puede romper el inicio */ })
    return () => { cancelled = true }
  }, [])

  if (count === 0) return null

  return (
    <Link
      href="/avisos"
      className="flex items-center gap-3 rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/20 p-3 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition"
    >
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {count} aviso{count === 1 ? '' : 's'} sin identificar
        </p>
        <p className="text-xs text-muted-foreground">
          Hay consultas que no sabemos de qué propiedad son. Identificalas para que lleguen al asesor correcto.
        </p>
      </div>
      <span className="text-sm font-medium text-[color:var(--brand)] inline-flex items-center whitespace-nowrap">
        Resolver <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  )
}

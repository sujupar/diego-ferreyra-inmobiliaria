'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { contarAvisosSinPropiedad, type Fallo } from './avisos-carga'

/**
 * Cartel del inicio: aparece SOLO si hay avisos sin propiedad (o si no se
 * pudieron leer). Cuenta y lleva a la hoja "Avisos sin propiedad" de Consultas
 * (`/consultas?avisos=1`): desde el 2026-10-30 los avisos se conectan solo ahí. Es la vía por la que la coordinadora se entera de que hay
 * trabajo pendiente sin entrar a la pantalla (decisión del usuario: nada de
 * WhatsApp ni emails nuevos).
 *
 * Por qué distingue el fallo: antes hacía `r.ok ? r.json() : { data: [] }` y
 * cualquier error terminaba en `count = 0` → el cartel no se dibujaba. O sea
 * que el aviso de "hay trabajo pendiente" desaparecía justo cuando el sistema
 * no podía saber si lo había. Un 500 de Supabase se veía exactamente igual que
 * "está todo identificado".
 *
 * El 403 sí se calla, y a propósito: un asesor no tiene nada que hacer en esta
 * cola (no la ve en el menú y la pantalla lo redirige). Ahí "no te corresponde"
 * no es un problema que haya que mostrarle.
 */
type Estado = { fase: 'callado' } | { fase: 'cuenta'; count: number } | { fase: 'error'; fallo: Fallo }

export function UnidentifiedBanner() {
  const [estado, setEstado] = useState<Estado>({ fase: 'callado' })

  useEffect(() => {
    let cancelled = false
    contarAvisosSinPropiedad(fetch)
      .then(r => {
        if (cancelled) return
        if (r.ok) {
          setEstado(r.valor > 0 ? { fase: 'cuenta', count: r.valor } : { fase: 'callado' })
          return
        }
        // "No te corresponde" no es una alerta; cualquier otra cosa sí.
        setEstado(r.fallo.sesionVencida || r.fallo.reintentable ? { fase: 'error', fallo: r.fallo } : { fase: 'callado' })
      })
      .catch(() => {
        /* `contarAvisosSinPropiedad` no lanza; esto es cinturón y tiradores. */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (estado.fase === 'callado') return null

  const clases =
    'flex items-center gap-3 rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/20 p-3 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition'

  if (estado.fase === 'error') {
    return (
      <Link href="/consultas?avisos=1" className={clases}>
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">No pudimos revisar los avisos sin propiedad</p>
          <p className="text-xs text-muted-foreground">
            {estado.fallo.motivo} Puede haber consultas esperando: entrá a revisarlo.
          </p>
        </div>
        <span className="text-sm font-medium text-[color:var(--brand)] inline-flex items-center whitespace-nowrap">
          Revisar <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
    )
  }

  return (
    <Link href="/consultas?avisos=1" className={clases}>
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {estado.count} aviso{estado.count === 1 ? '' : 's'} sin propiedad
        </p>
        <p className="text-xs text-muted-foreground">
          Hay consultas que no sabemos de qué propiedad son. Conectalas para que le lleguen a quien la muestra.
        </p>
      </div>
      <span className="text-sm font-medium text-[color:var(--brand)] inline-flex items-center whitespace-nowrap">
        Resolver <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  )
}

'use client'
/**
 * E1.6 Editor — autosave del borrador. Debounce ~800ms: valida el documento con Zod
 * en el cliente y hace PATCH { draftContent }. Expone flush() para forzar el guardado
 * pendiente antes de publicar. No escribe si el documento no cambió.
 *
 * save()/flush() devuelven un booleano (true = guardado/nada que guardar, false =
 * error) para que "Publicar" pueda ABORTAR si el último borrador no se persistió.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LandingDocument } from '@/lib/landing/schema'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useAutosave(propertyId: string, doc: LandingDocument) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef<string>('') // JSON del último doc guardado
  const pending = useRef<LandingDocument | null>(null)
  const firstRun = useRef(true)

  const save = useCallback(async (d: LandingDocument): Promise<boolean> => {
    const json = JSON.stringify(d)
    if (json === lastSaved.current) return true // ya guardado, nada que hacer
    const parsed = LandingDocument.safeParse(d)
    if (!parsed.success) { setStatus('error'); return false }
    setStatus('saving')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftContent: parsed.data }),
      })
      if (!res.ok) throw new Error()
      lastSaved.current = json
      // Solo limpiamos si `pending` sigue apuntando a ESTE doc: si el asesor editó
      // durante el PATCH en vuelo, `pending` ya es más nuevo y NO hay que pisarlo.
      if (pending.current === d) pending.current = null
      setStatus('saved')
      return true
    } catch {
      setStatus('error')
      return false
    }
  }, [propertyId])

  // Inicializa lastSaved con el doc de arranque (no re-guarda lo que vino del server).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      lastSaved.current = JSON.stringify(doc)
      return
    }
    pending.current = doc
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (pending.current) void save(pending.current) }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [doc, save])

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current) return save(pending.current)
    return true
  }, [save])

  return { status, flush }
}

'use client'
/**
 * E1.6 Editor — autosave del borrador. Debounce ~800ms: valida el documento con Zod
 * en el cliente y hace PATCH { draftContent }. Expone flush() para forzar el guardado
 * pendiente antes de publicar. No escribe si el documento no cambió.
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

  const save = useCallback(async (d: LandingDocument) => {
    const json = JSON.stringify(d)
    if (json === lastSaved.current) return
    const parsed = LandingDocument.safeParse(d)
    if (!parsed.success) { setStatus('error'); return }
    setStatus('saving')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftContent: parsed.data }),
      })
      if (!res.ok) throw new Error()
      lastSaved.current = json
      pending.current = null
      setStatus('saved')
    } catch {
      setStatus('error')
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
    timer.current = setTimeout(() => { if (pending.current) save(pending.current) }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [doc, save])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current) await save(pending.current)
  }, [save])

  return { status, flush }
}

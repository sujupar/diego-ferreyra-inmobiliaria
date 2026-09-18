'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { puedeReasignarAsesor } from '@/lib/deals/proceso-manual'

/**
 * El asesor del proceso, y —para quien ve todo el pipeline— la forma de
 * cambiarlo.
 *
 * POR QUÉ (2026-09-17): los procesos creados a mano quedaron sin asesor, y el
 * CRM le muestra a cada asesor solo lo suyo. Sin una forma de asignarlo desde
 * la ficha, esos procesos no le aparecían a nadie. La barrera real es la ruta
 * (`PUT /api/deals/[id]`); acá solo se evita ofrecer un control que va a dar 403.
 */
interface Props {
  dealId: string
  asesorId?: string | null
  asesorNombre?: string | null
  onCambiado: () => void
}

export function AsesorDelProceso({ dealId, asesorId, asesorNombre, onCambiado }: Props) {
  const [puedeCambiar, setPuedeCambiar] = useState(false)
  const [asesores, setAsesores] = useState<{ id: string; full_name: string }[]>([])
  const [editando, setEditando] = useState(false)
  const [elegido, setElegido] = useState(asesorId ?? '')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let cancelado = false
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(me => {
        if (cancelado || !puedeReasignarAsesor(me?.role)) return
        setPuedeCambiar(true)
        return fetch('/api/users/advisors')
          .then(r => (r.ok ? r.json() : { data: [] }))
          .then(j => { if (!cancelado) setAsesores(j.data || []) })
      })
      .catch(() => {})
    return () => { cancelado = true }
  }, [])

  useEffect(() => { setElegido(asesorId ?? '') }, [asesorId])

  async function guardar() {
    if (!elegido || elegido === asesorId) { setEditando(false); return }
    setGuardando(true)
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: elegido }),
      })
      const j = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) throw new Error(j.error || `No se pudo cambiar el asesor (HTTP ${res.status})`)
      toast.success('Asesor actualizado')
      setEditando(false)
      onCambiado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el asesor')
    } finally {
      setGuardando(false)
    }
  }

  if (editando) {
    return (
      <span className="flex items-center gap-2 flex-wrap">
        <select
          aria-label="Asesor del proceso"
          value={elegido}
          onChange={e => setElegido(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="">Elegir…</option>
          {asesores.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </select>
        <Button size="sm" onClick={guardar} disabled={guardando || !elegido} className="h-7">
          {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setElegido(asesorId ?? '') }} className="h-7">
          Cancelar
        </Button>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-2">
      {asesorNombre
        ? <span>{asesorNombre}</span>
        : <span className="font-medium text-[color:var(--destructive)]">Sin asignar</span>}
      {puedeCambiar && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(true)} className="h-6 px-2 text-xs">
          {asesorNombre ? 'Cambiar' : 'Asignar'}
        </Button>
      )}
    </span>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import type { VisitaListado } from '@/lib/visitas/tipos'
import { formatearFechaHora } from '@/lib/visitas/horario'

// Cartel de visitas pendientes de marcar (estaba en la página vieja de /tasks y se conserva:
// diferencia 1 con la maqueta). Informativo: si no hay dato, no se dibuja.
export function VisitasAtrasadas() {
  const [visitas, setVisitas] = useState<VisitaListado[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelado = false
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((yo: { id?: string } | null) => {
        if (!yo?.id || cancelado) return null
        return fetch(`/api/visits?advisor_id=${yo.id}&status=scheduled&to=${encodeURIComponent(new Date().toISOString())}`)
      })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((j: { data?: VisitaListado[]; total?: number } | null) => {
        if (cancelado || !j) return
        const data = Array.isArray(j.data) ? j.data : []
        setVisitas(data)
        setTotal(typeof j.total === 'number' ? j.total : data.length)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [])

  if (visitas.length === 0) return null
  return (
    <Card className="border-2 border-orange-500">
      <CardContent className="pt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-orange-700">Visitas pendientes de marcar ({total})</h3>
          <Link href="/visits" className="inline-flex items-center text-sm text-primary underline max-md:min-h-11">
            Ver todas
          </Link>
        </div>
        <ul className="space-y-2 max-md:space-y-0 max-md:divide-y">
          {visitas.map((v) => (
            <li key={v.id} className="text-sm">
              <Link href={`/visits/${v.id}`} className="block hover:underline max-md:flex max-md:min-h-11 max-md:flex-col max-md:justify-center max-md:py-2">
                <span className="break-words font-medium">{v.direccion ?? '-'}</span>
                <span className="text-muted-foreground max-md:block max-md:text-xs">
                  <span className="max-md:hidden"> · </span>
                  {v.client_name} · {formatearFechaHora(v.scheduled_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

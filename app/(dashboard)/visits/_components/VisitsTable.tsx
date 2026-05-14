'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: 'bg-blue-500' },
  completed: { label: 'Realizada', color: 'bg-green-500' },
  no_show: { label: 'No se realizó', color: 'bg-orange-500' },
  cancelled: { label: 'Cancelada', color: 'bg-gray-400' },
}

export function VisitsTable({ visits }: { visits: PropertyVisitWithRelations[] }) {
  if (visits.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No hay visitas</div>
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left p-3">Fecha/Hora</th>
            <th className="text-left p-3">Propiedad</th>
            <th className="text-left p-3">Cliente</th>
            <th className="text-left p-3">Asesor</th>
            <th className="text-left p-3">Estado</th>
            <th className="text-right p-3"></th>
          </tr>
        </thead>
        <tbody>
          {visits.map(v => {
            const s = STATUS_LABEL[v.status] ?? STATUS_LABEL.scheduled
            return (
              <tr key={v.id} className="border-t hover:bg-muted/50">
                <td className="p-3 whitespace-nowrap">{new Date(v.scheduled_at).toLocaleString('es-AR')}</td>
                <td className="p-3">{v.property?.address ?? '-'}</td>
                <td className="p-3">{v.client_name}</td>
                <td className="p-3">{v.advisor?.full_name ?? '-'}</td>
                <td className="p-3"><Badge className={`${s.color} text-white`}>{s.label}</Badge></td>
                <td className="p-3 text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/visits/${v.id}`}>Ver</Link>
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

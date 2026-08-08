'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, Column } from '@/components/ui/DataTable'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending_confirmation: { label: 'A confirmar', color: 'bg-amber-500' },
  scheduled: { label: 'Agendada', color: 'bg-blue-500' },
  completed: { label: 'Realizada', color: 'bg-green-500' },
  no_show: { label: 'No se realizó', color: 'bg-orange-500' },
  cancelled: { label: 'Cancelada', color: 'bg-gray-400' },
}

export function VisitsTable({ visits }: { visits: PropertyVisitWithRelations[] }) {
  const router = useRouter()

  // `property`/`advisor` no van con `sortable`: son objetos anidados y el
  // orden en memoria de `DataTable` compara `row[key]` directo — sobre un
  // objeto la comparación no tiene sentido (ver el comentario de `DataTable`
  // sobre el modo no controlado).
  const columns: Column<PropertyVisitWithRelations>[] = [
    {
      key: 'scheduled_at',
      label: 'Fecha/Hora',
      sortable: true,
      render: v => <span className="whitespace-nowrap">{new Date(v.scheduled_at).toLocaleString('es-AR')}</span>,
    },
    { key: 'property', label: 'Propiedad', render: v => <span>{v.property?.address ?? '-'}</span> },
    { key: 'client_name', label: 'Cliente', sortable: true, render: v => <span>{v.client_name}</span> },
    { key: 'advisor', label: 'Asesor', render: v => <span>{v.advisor?.full_name ?? '-'}</span> },
    {
      key: 'status',
      label: 'Estado',
      sortable: true,
      render: v => {
        const s = STATUS_LABEL[v.status] ?? STATUS_LABEL.scheduled
        return <Badge className={`${s.color} text-white`}>{s.label}</Badge>
      },
    },
    {
      key: 'acciones',
      label: '',
      className: 'text-right',
      // La fila entera navega (onRowClick, abajo) — este botón hace lo
      // mismo, así que sin `stopPropagation` el click dispara la navegación
      // DOS veces (una por el botón/Link, otra por el handler de la fila).
      render: v => (
        <div onClick={e => e.stopPropagation()}>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/visits/${v.id}`}>Ver</Link>
          </Button>
        </div>
      ),
    },
  ]

  return (
    <DataTable
      data={visits}
      columns={columns}
      getRowKey={v => v.id}
      onRowClick={v => router.push(`/visits/${v.id}`)}
      emptyMessage="No hay visitas"
    />
  )
}

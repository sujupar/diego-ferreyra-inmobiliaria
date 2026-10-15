'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EstadoVisitaBadge } from '@/components/visitas/EstadoVisitaBadge'
import { formatearFechaCorta, etiquetaDeOrigen } from '@/lib/visitas/presentacion'
import type { VisitaListado } from '@/lib/visitas/tipos'

/**
 * Lista de "Ver todas". En el teléfono `DataTable` la apila como fichas: la fecha es el
 * título, el estado la insignia; el asesor y "Ver" se esconden (la ficha entera navega).
 * La fecha va en hora ARGENTINA (antes salía sin zona: en el servidor, corrida 3 h).
 */
export function VisitsTable({ visits, mostrarAsesor }: { visits: VisitaListado[]; mostrarAsesor: boolean }) {
  const router = useRouter()
  const columns: Column<VisitaListado>[] = [
    { key: 'scheduled_at', label: 'Fecha/Hora', card: 'title', render: v => <span className="whitespace-nowrap">{formatearFechaCorta(v.scheduled_at)}</span> },
    { key: 'direccion', label: 'Propiedad', wrap: true, card: 'meta', render: v => <span>{v.direccion ?? '-'}</span> },
    { key: 'client_name', label: 'Persona', card: 'meta', render: v => <span>{v.client_name}</span> },
    { key: 'origin', label: 'Origen', wrap: true, card: 'meta', render: v => <span>{etiquetaDeOrigen(v.origin, v.origin_detail)}</span> },
    ...(mostrarAsesor
      ? [{ key: 'asesor', label: 'Asesor', card: 'none', render: (v: VisitaListado) => <span>{v.asesor_nombre ?? 'Sin asesor'}</span> } satisfies Column<VisitaListado>]
      : []),
    { key: 'status', label: 'Estado', card: 'badge', render: v => <EstadoVisitaBadge estado={v.status} /> },
    {
      key: 'acciones', label: '', className: 'text-right', card: 'none',
      // La fila entera navega: sin stopPropagation el botón dispararía DOS navegaciones.
      render: v => (
        <div onClick={e => e.stopPropagation()}>
          <Button variant="outline" size="sm" asChild><Link href={`/visits/${v.id}`}>Ver</Link></Button>
        </div>
      ),
    },
  ]
  return (
    <DataTable data={visits} columns={columns} getRowKey={v => v.id} onRowClick={v => router.push(`/visits/${v.id}`)} emptyMessage="No hay visitas con estos filtros" />
  )
}

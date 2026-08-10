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

/**
 * Fecha corta para la agenda: "01/08/26, 12:00".
 *
 * `toLocaleString('es-AR')` sin opciones imprime "1/8/2026, 12:00:00". Los
 * SEGUNDOS de una visita no le sirven a nadie y los dígitos sueltos no alinean;
 * en la ficha del teléfono esta fecha es además el TÍTULO, así que cada
 * carácter que sobra le come ancho a lo que sigue.
 *
 * Tres cosas salieron probándolo y por eso está escrita así:
 *  · el año se QUEDA (en dos dígitos). Es tentador sacarlo —la agenda es de
 *    esta semana— pero el coordinador filtra rangos viejos, y "01/08" sin año
 *    es ambiguo;
 *  · pidiendo fecha Y hora en la MISMA llamada, es-AR ignora el `2-digit` del
 *    día y del mes ("1/8"); pidiendo la fecha sola con el año, lo respeta;
 *  · `hour: '2-digit'` a secas devuelve "10:00 a. m." — reloj de 12 horas, que
 *    en Argentina no se usa y encima es más largo. De ahí el `hourCycle`.
 */
function fechaCorta(iso: string): string {
  const cuando = new Date(iso)
  const dia = cuando.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const hora = cuando.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${dia}, ${hora}`
}

export function VisitsTable({ visits }: { visits: PropertyVisitWithRelations[] }) {
  const router = useRouter()

  // `property`/`advisor` no van con `sortable`: son objetos anidados y el
  // orden en memoria de `DataTable` compara `row[key]` directo — sobre un
  // objeto la comparación no tiene sentido (ver el comentario de `DataTable`
  // sobre el modo no controlado).
  //
  // Qué muestra la FICHA en el teléfono (`card`), pensado para un asesor que
  // va de una visita a la otra: CUÁNDO es el título, el estado es la insignia,
  // y adónde va + con quién son los metadatos. Se esconden el asesor (en su
  // agenda son todas suyas; el coordinador mira esto sentado) y el botón "Ver"
  // (la ficha entera ya navega al mismo lado — el botón sería un blanco de
  // 40px adentro de otro blanco que hace lo mismo).
  const columns: Column<PropertyVisitWithRelations>[] = [
    {
      key: 'scheduled_at',
      label: 'Fecha/Hora',
      sortable: true,
      card: 'title',
      render: v => <span className="whitespace-nowrap">{fechaCorta(v.scheduled_at)}</span>,
    },
    { key: 'property', label: 'Propiedad', wrap: true, card: 'meta', render: v => <span>{v.property?.address ?? '-'}</span> },
    { key: 'client_name', label: 'Cliente', sortable: true, card: 'meta', render: v => <span>{v.client_name}</span> },
    { key: 'advisor', label: 'Asesor', card: 'none', render: v => <span>{v.advisor?.full_name ?? '-'}</span> },
    {
      key: 'status',
      label: 'Estado',
      sortable: true,
      card: 'badge',
      render: v => {
        const s = STATUS_LABEL[v.status] ?? STATUS_LABEL.scheduled
        return <Badge className={`${s.color} text-white`}>{s.label}</Badge>
      },
    },
    {
      key: 'acciones',
      label: '',
      className: 'text-right',
      card: 'none',
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

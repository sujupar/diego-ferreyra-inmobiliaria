'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export interface VisitsFilters {
  status: string
  advisorId: string
  propertyId: string
  from: string
  to: string
  onlyMine: boolean
}

interface Props {
  filters: VisitsFilters
  setFilters: (f: VisitsFilters) => void
  advisors: { id: string; full_name: string }[]
  isAdmin: boolean
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'scheduled', label: 'Agendadas' },
  { value: 'completed', label: 'Realizadas' },
  { value: 'no_show', label: 'No se realizó' },
  { value: 'cancelled', label: 'Canceladas' },
]

export function VisitFiltersBar({ filters, setFilters, advisors, isAdmin }: Props) {
  const advisorOptions = [
    { value: '', label: 'Todos los asesores' },
    ...advisors.map(a => ({ value: a.id, label: a.full_name })),
  ]

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border rounded-lg bg-card">
      <div className="space-y-1">
        <label className="text-xs font-medium">Estado</label>
        <Select
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={e => setFilters({ ...filters, status: e.target.value })}
          className="w-40"
        />
      </div>

      {isAdmin && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Asesor</label>
          <Select
            options={advisorOptions}
            value={filters.advisorId}
            onChange={e => setFilters({ ...filters, advisorId: e.target.value })}
            className="w-48"
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium">Desde</label>
        <Input
          type="date"
          value={filters.from}
          onChange={e => setFilters({ ...filters, from: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Hasta</label>
        <Input
          type="date"
          value={filters.to}
          onChange={e => setFilters({ ...filters, to: e.target.value })}
          className="w-40"
        />
      </div>

      <Button
        variant={filters.onlyMine ? 'default' : 'outline'}
        onClick={() => setFilters({ ...filters, onlyMine: !filters.onlyMine })}
      >
        Solo mías
      </Button>
    </div>
  )
}

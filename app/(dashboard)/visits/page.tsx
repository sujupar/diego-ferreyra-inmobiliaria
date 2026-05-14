'use client'

import { useEffect, useState } from 'react'
import { VisitFiltersBar, type VisitsFilters } from './_components/VisitFiltersBar'
import { VisitsTable } from './_components/VisitsTable'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

export default function VisitsPage() {
  const [user, setUser] = useState<{ id: string; role: string } | null>(null)
  const [advisors, setAdvisors] = useState<{ id: string; full_name: string }[]>([])
  const [visits, setVisits] = useState<PropertyVisitWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<VisitsFilters>({
    status: '', advisorId: '', propertyId: '', from: '', to: '', onlyMine: false,
  })

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setUser(d?.id ? d : null))
      .catch(() => {})
    fetch('/api/profiles?role=asesor')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setAdvisors(j.data ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.advisorId) params.set('advisor_id', filters.advisorId)
    if (filters.propertyId) params.set('property_id', filters.propertyId)
    if (filters.from) params.set('from', new Date(filters.from).toISOString())
    if (filters.to) params.set('to', new Date(filters.to + 'T23:59:59').toISOString())
    if (filters.onlyMine && user?.id) params.set('advisor_id', user.id)

    setLoading(true)
    fetch(`/api/visits?${params}`)
      .then(r => r.json())
      .then(({ data }) => setVisits(data ?? []))
      .finally(() => setLoading(false))
  }, [filters, user])

  const isAdmin = !!user && ['admin', 'dueno', 'coordinador'].includes(user.role)

  return (
    <div className="container mx-auto py-6 space-y-4">
      <h1 className="text-2xl font-semibold">Visitas</h1>
      <VisitFiltersBar filters={filters} setFilters={setFilters} advisors={advisors} isAdmin={isAdmin} />
      {loading
        ? <div className="p-8 text-center text-muted-foreground">Cargando…</div>
        : <VisitsTable visits={visits} />}
    </div>
  )
}

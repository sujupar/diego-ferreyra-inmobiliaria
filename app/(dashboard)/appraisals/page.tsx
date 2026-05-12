'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AppraisalSummary } from '@/lib/supabase/appraisals'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { DataTable, Column } from '@/components/ui/DataTable'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import {
    Trash2, ChevronLeft, ChevronRight, Plus, Loader2, FileText,
    MapPin, Calendar, Edit2, LayoutList, Table2
} from 'lucide-react'

function formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency', currency: currency === 'ARS' ? 'ARS' : 'USD',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value)
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AppraisalsHistoryPage() {
    const router = useRouter()
    const [appraisals, setAppraisals] = useState<AppraisalSummary[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('table')
    const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' })
    const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkActioning, setBulkActioning] = useState(false)
    const pageSize = 12

    // Get current user info for role-based filtering
    useEffect(() => {
        fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {})
    }, [])

    useEffect(() => {
        setLoading(true)
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', String(pageSize))
        if (dateRange.from) params.set('from', dateRange.from)
        if (dateRange.to) params.set('to', dateRange.to)
        if (userInfo?.role === 'asesor') params.set('assigned_to', userInfo.id)

        fetch(`/api/appraisals?${params}`)
            .then(r => r.json())
            .then(({ data, count }) => {
                setAppraisals(data || [])
                setTotalCount(count || 0)
            })
            .catch(err => console.error('Error loading appraisals:', err))
            .finally(() => setLoading(false))
    }, [page, dateRange, userInfo])

    async function handleDelete(e: React.MouseEvent, id: string) {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm('Eliminar esta tasacion?')) return
        setDeleting(id)
        try {
            await fetch(`/api/appraisals/${id}`, { method: 'DELETE' })
            setAppraisals(prev => prev.filter(a => a.id !== id))
            setTotalCount(prev => prev - 1)
        } catch (err) {
            console.error('Delete error:', err)
        } finally {
            setDeleting(null)
        }
    }

    async function handleBulkDelete() {
        const ids = Array.from(selectedIds)
        if (ids.length === 0) return
        const confirmation = prompt(
            `Vas a ELIMINAR DEFINITIVAMENTE ${ids.length} tasacion${ids.length !== 1 ? 'es' : ''}.\n\n` +
            `Para confirmar, escribí ELIMINAR:`
        )
        if (confirmation !== 'ELIMINAR') return
        setBulkActioning(true)
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/appraisals/${id}`, { method: 'DELETE' }))
        )
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
        const deletedIds = new Set(
            ids.filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<Response>).value.ok)
        )
        setAppraisals(prev => prev.filter(a => !deletedIds.has(a.id)))
        setTotalCount(prev => prev - deletedIds.size)
        setSelectedIds(new Set())
        setBulkActioning(false)
        if (failed > 0) alert(`${failed} no se pudieron eliminar.`)
    }

    const totalPages = Math.ceil(totalCount / pageSize)

    const columns: Column<AppraisalSummary>[] = [
        { key: 'property_title', label: 'Propiedad', sortable: true, render: r => <span className="font-medium">{r.property_title || 'Sin titulo'}</span> },
        { key: 'property_location', label: 'Ubicacion', sortable: true, render: r => <span className="text-muted-foreground truncate max-w-[200px] block">{r.property_location}</span> },
        { key: 'publication_price', label: 'Precio', sortable: true, className: 'text-right', render: r => <span className="font-medium">{formatCurrency(r.publication_price, r.currency || 'USD')}</span> },
        { key: 'comparable_count', label: 'Comp.', sortable: true, className: 'text-center', render: r => <Badge variant="secondary">{r.comparable_count}</Badge> },
        { key: 'created_at', label: 'Fecha', sortable: true, render: r => <span className="text-sm text-muted-foreground">{formatDate(r.created_at)}</span> },
        { key: 'actions', label: '', render: r => (
            <div className="flex gap-1">
                <Link href={`/appraisal/new?editId=${r.id}`} onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm"><Edit2 className="h-3.5 w-3.5" /></Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={e => handleDelete(e, r.id)} disabled={deleting === r.id}>
                    {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                </Button>
            </div>
        )},
    ]

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Historial de Tasaciones</h1>
                    <p className="text-sm text-muted-foreground">{totalCount} tasacion{totalCount !== 1 ? 'es' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-md border">
                        <button onClick={() => setViewMode('cards')} className={`p-2 ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutList className="h-4 w-4" /></button>
                        <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Table2 className="h-4 w-4" /></button>
                    </div>
                    <Link href="/appraisal/new">
                        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva</Button>
                    </Link>
                </div>
            </div>

            <DateRangeFilter onChange={setDateRange} />

            <BulkActionsBar
                count={selectedIds.size}
                onClear={() => setSelectedIds(new Set())}
                noun="tasaciones"
                actions={[
                    { label: 'Eliminar', icon: <Trash2 className="h-4 w-4 mr-1" />, variant: 'destructive', onClick: handleBulkDelete, disabled: bulkActioning },
                ]}
            />

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : appraisals.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-1">Sin tasaciones</h3>
                        <p className="text-sm text-muted-foreground mb-4">Crea tu primera tasacion.</p>
                        <Link href="/appraisal/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Tasacion</Button></Link>
                    </CardContent>
                </Card>
            ) : viewMode === 'table' ? (
                <DataTable
                    data={appraisals}
                    columns={columns}
                    getRowKey={r => r.id}
                    onRowClick={r => router.push(`/appraisals/${r.id}`)}
                    selectable
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {appraisals.map(a => (
                        <Link key={a.id} href={`/appraisals/${a.id}`}>
                            <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full">
                                <CardContent className="p-4">
                                    <h3 className="font-medium mb-1 truncate">{a.property_title || 'Sin titulo'}</h3>
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2"><MapPin className="h-3.5 w-3.5" />{a.property_location}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-lg font-bold">{formatCurrency(a.publication_price, a.currency || 'USD')}</span>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary">{a.comparable_count} comp.</Badge>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(a.created_at)}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">Pagina {page} de {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}

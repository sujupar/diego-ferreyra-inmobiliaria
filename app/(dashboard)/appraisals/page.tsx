'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getAppraisals, deleteAppraisal, AppraisalSummary } from '@/lib/supabase/appraisals'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Trash2,
    ChevronLeft,
    ChevronRight,
    Plus,
    Loader2,
    FileText,
    MapPin,
    Calendar,
    Edit2
} from 'lucide-react'

function formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency === 'ARS' ? 'ARS' : 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)
}

export default function AppraisalsHistoryPage() {
    const [appraisals, setAppraisals] = useState<AppraisalSummary[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState<string | null>(null)
    const pageSize = 12

    useEffect(() => {
        setLoading(true)
        getAppraisals(page, pageSize)
            .then(({ data, count }) => {
                setAppraisals(data)
                setTotalCount(count)
            })
            .catch(err => console.error('Error loading appraisals:', err))
            .finally(() => setLoading(false))
    }, [page])

    async function handleDelete(e: React.MouseEvent, id: string) {
        e.preventDefault()
        e.stopPropagation()
        if (!window.confirm('¿Estás seguro de que deseas eliminar esta tasación?')) return

        setDeleting(id)
        try {
            await deleteAppraisal(id)
            setAppraisals(prev => prev.filter(a => a.id !== id))
            setTotalCount(prev => prev - 1)
        } catch (err) {
            console.error('Error deleting appraisal:', err)
        } finally {
            setDeleting(null)
        }
    }

    const totalPages = Math.ceil(totalCount / pageSize)

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Historial de Tasaciones</h1>
                    <p className="text-muted-foreground mt-1">
                        {totalCount > 0 ? `${totalCount} tasación${totalCount !== 1 ? 'es' : ''} guardada${totalCount !== 1 ? 's' : ''}` : 'Sin tasaciones guardadas'}
                    </p>
                </div>
                <Link href="/appraisal/new">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Nueva Tasación
                    </Button>
                </Link>
            </div>

            {/* Loading skeletons */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded-xl border overflow-hidden">
                            <div className="aspect-video bg-muted animate-pulse" />
                            <div className="p-4 space-y-3">
                                <div className="h-5 bg-muted animate-pulse rounded w-3/4" />
                                <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                                <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
                                <div className="h-6 bg-muted animate-pulse rounded w-2/5 mt-4" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && appraisals.length === 0 && (
                <div className="text-center py-20">
                    <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                    <h2 className="text-xl font-semibold text-muted-foreground mb-2">Sin tasaciones</h2>
                    <p className="text-muted-foreground mb-6">Las tasaciones se guardan automáticamente al calcular el valor de mercado.</p>
                    <Link href="/appraisal/new">
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Crear primera tasación
                        </Button>
                    </Link>
                </div>
            )}

            {/* Grid */}
            {!loading && appraisals.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {appraisals.map(appraisal => (
                        <Link key={appraisal.id} href={`/appraisals/${appraisal.id}`}>
                            <Card className="h-full hover:shadow-md transition-all duration-200 cursor-pointer group">
                                {/* Image */}
                                {appraisal.property_images?.[0] ? (
                                    <div className="aspect-video overflow-hidden rounded-t-xl relative">
                                        <Image
                                            src={appraisal.property_images[0]}
                                            alt={appraisal.property_title || 'Propiedad'}
                                            fill
                                            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                                            loading="lazy"
                                            unoptimized
                                        />
                                    </div>
                                ) : (
                                    <div className="aspect-video bg-muted rounded-t-xl flex items-center justify-center">
                                        <FileText className="h-12 w-12 text-muted-foreground/30" />
                                    </div>
                                )}

                                <CardContent className="p-4 space-y-3">
                                    {/* Title */}
                                    <h3 className="font-semibold text-base line-clamp-1">
                                        {appraisal.property_title || appraisal.property_location}
                                    </h3>

                                    {/* Location */}
                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                                        <span className="line-clamp-1">{appraisal.property_location}</span>
                                    </div>

                                    {/* Date */}
                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                                        <span>
                                            {new Date(appraisal.created_at).toLocaleDateString('es-AR', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </span>
                                    </div>

                                    {/* Price + Badge + Delete */}
                                    <div className="flex items-center justify-between pt-2 border-t">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-primary">
                                                {formatCurrency(appraisal.publication_price, appraisal.currency || 'USD')}
                                            </span>
                                            <Badge variant="secondary" className="text-xs">
                                                {appraisal.comparable_count} comp.
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                asChild
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Link href={`/appraisal/new?editId=${appraisal.id}`}>
                                                    <Edit2 className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                                onClick={(e) => handleDelete(e, appraisal.id)}
                                                disabled={deleting === appraisal.id}
                                            >
                                                {deleting === appraisal.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
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
                <div className="flex items-center justify-center gap-4 pt-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="gap-1"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Página {page} de {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="gap-1"
                    >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}

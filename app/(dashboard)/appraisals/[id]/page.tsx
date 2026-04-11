'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { getAppraisal, AppraisalDetail } from '@/lib/supabase/appraisals'
import { ValuationReport } from '@/components/appraisal/ValuationReport'
import { PDFDownloadButton } from '@/components/appraisal/PDFDownloadButton'
import { ValuationProperty, ValuationResult } from '@/lib/valuation/calculator'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileText, AlertCircle, Edit2 } from 'lucide-react'

const PDFPreviewModal = dynamic(
    () => import('@/components/appraisal/PDFPreviewModal').then(m => m.PDFPreviewModal),
    { ssr: false }
)

export default function AppraisalDetailPage() {
    const params = useParams()
    const [appraisal, setAppraisal] = useState<AppraisalDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showPDFPreview, setShowPDFPreview] = useState(false)

    // Market image settings are loaded lazily by PDFPreviewModal on open

    useEffect(() => {
        const id = params.id as string
        if (!id) return

        getAppraisal(id)
            .then(data => {
                if (!data) setError('Tasación no encontrada')
                else setAppraisal(data)
            })
            .catch(err => {
                console.error('Error loading appraisal:', err)
                setError('Error al cargar la tasación')
            })
            .finally(() => setLoading(false))
    }, [params.id])

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto space-y-8 pb-20">
                {/* Header skeleton */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-8 w-20 bg-muted animate-pulse rounded" />
                        <div className="space-y-2">
                            <div className="h-6 w-64 bg-muted animate-pulse rounded" />
                            <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="h-10 w-36 bg-muted animate-pulse rounded" />
                        <div className="h-10 w-40 bg-muted animate-pulse rounded" />
                    </div>
                </div>
                {/* Report skeleton */}
                <div className="bg-card rounded-xl border p-8 space-y-6">
                    <div className="h-8 w-56 bg-muted animate-pulse rounded" />
                    <div className="grid grid-cols-4 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="space-y-2">
                                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                            </div>
                        ))}
                    </div>
                    <div className="h-48 bg-muted animate-pulse rounded" />
                </div>
            </div>
        )
    }

    if (error || !appraisal) {
        return (
            <div className="max-w-5xl mx-auto text-center py-20">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-2">{error || 'Tasación no encontrada'}</h2>
                <Link href="/appraisals">
                    <Button variant="outline" className="gap-2 mt-4">
                        <ArrowLeft className="h-4 w-4" />
                        Volver al Historial
                    </Button>
                </Link>
            </div>
        )
    }

    // Reconstruct ValuationProperty from stored data
    const subject: ValuationProperty = {
        price: appraisal.property_price,
        currency: appraisal.property_currency,
        title: appraisal.property_title || undefined,
        location: appraisal.property_location,
        images: appraisal.property_images || undefined,
        description: appraisal.property_description || undefined,
        features: appraisal.property_features,
    }

    // Separate normal comparables from overpriced properties
    const normalComps = appraisal.comparables.filter(c => {
        const analysis = c.analysis as Record<string, unknown> | null
        return analysis?.propertyType !== 'overpriced'
    })
    const overpricedComps = appraisal.comparables.filter(c => {
        const analysis = c.analysis as Record<string, unknown> | null
        return analysis?.propertyType === 'overpriced'
    })

    const comparables: ValuationProperty[] = normalComps.map(c => ({
        price: c.price,
        currency: c.currency,
        title: c.title || undefined,
        location: c.location || undefined,
        url: c.url || undefined,
        images: c.images || undefined,
        description: c.description || undefined,
        features: c.features,
    }))

    const overpriced: ValuationProperty[] = overpricedComps.map(c => ({
        price: c.price,
        currency: c.currency,
        title: c.title || undefined,
        location: c.location || undefined,
        url: c.url || undefined,
        images: c.images || undefined,
        description: c.description || undefined,
        features: c.features,
    }))

    const result: ValuationResult = appraisal.valuation_result || {} as ValuationResult
    const hasFullValuation = result.subjectSurface != null && result.comparableAnalysis?.length > 0

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/appraisals">
                        <Button variant="ghost" size="sm" className="gap-1">
                            <ArrowLeft className="h-4 w-4" />
                            Historial
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {appraisal.property_title || appraisal.property_location}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {new Date(appraisal.created_at).toLocaleDateString('es-AR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Link href={`/appraisal/new?editId=${appraisal.id}`}>
                        <Button variant="outline" className="gap-2">
                            <Edit2 className="h-4 w-4" />
                            Editar Tasación
                        </Button>
                    </Link>
                    <Button className="gap-2" onClick={() => setShowPDFPreview(true)}>
                        <FileText className="h-4 w-4" />
                        Vista Previa PDF
                    </Button>
                </div>
            </div>

            {/* Report */}
            {hasFullValuation ? (
                <ValuationReport subject={subject} result={result} />
            ) : (
                <div className="rounded-lg border p-6 space-y-4">
                    <h2 className="text-lg font-semibold">Resumen de Tasacion</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div><span className="text-muted-foreground">Precio Publicacion:</span> <span className="font-bold">{result.publicationPrice ? `USD ${result.publicationPrice.toLocaleString('es-AR')}` : '—'}</span></div>
                        <div><span className="text-muted-foreground">Valor de Venta:</span> <span className="font-bold">{result.saleValue ? `USD ${result.saleValue.toLocaleString('es-AR')}` : '—'}</span></div>
                        <div><span className="text-muted-foreground">Dinero en Mano:</span> <span className="font-bold">{result.moneyInHand ? `USD ${result.moneyInHand.toLocaleString('es-AR')}` : '—'}</span></div>
                        <div><span className="text-muted-foreground">Comparables:</span> <span>{appraisal.comparable_count}</span></div>
                        <div><span className="text-muted-foreground">Ubicacion:</span> <span>{appraisal.property_location}</span></div>
                    </div>
                    <p className="text-xs text-muted-foreground">Tasacion simplificada — sin analisis detallado de comparables.</p>
                </div>
            )}

            {/* PDF Preview Modal — market image settings are loaded lazily by the modal itself */}
            {showPDFPreview && (
                <PDFPreviewModal
                    open={showPDFPreview}
                    onOpenChange={setShowPDFPreview}
                    subject={subject}
                    comparables={comparables}
                    valuationResult={result}
                    overpriced={overpriced}
                />
            )}
        </div>
    )
}

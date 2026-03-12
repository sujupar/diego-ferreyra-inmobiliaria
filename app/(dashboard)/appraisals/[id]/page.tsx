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
import { ArrowLeft, Loader2, FileText, AlertCircle } from 'lucide-react'

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
    const [marketImageLabels, setMarketImageLabels] = useState<Record<string, { label: string; description: string }>>({})
    const [marketImageUrls, setMarketImageUrls] = useState<Record<string, string>>({})

    useEffect(() => {
        fetch('/api/settings/market-images')
            .then(res => res.json())
            .then(data => {
                if (data.slots) {
                    const labels: Record<string, { label: string; description: string }> = {}
                    const urls: Record<string, string> = {}
                    for (const slot of data.slots) {
                        labels[slot.id] = { label: slot.label, description: slot.description || '' }
                        if (slot.currentPath) urls[slot.id] = slot.currentPath
                    }
                    setMarketImageLabels(labels)
                    setMarketImageUrls(urls)
                }
            })
            .catch(() => { /* use defaults */ })
    }, [])

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
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

    const result: ValuationResult = appraisal.valuation_result

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

                <Button className="gap-2" onClick={() => setShowPDFPreview(true)}>
                    <FileText className="h-4 w-4" />
                    Vista Previa PDF
                </Button>
            </div>

            {/* Report */}
            <ValuationReport subject={subject} result={result} />

            {/* PDF Preview Modal */}
            {showPDFPreview && (
                <PDFPreviewModal
                    open={showPDFPreview}
                    onOpenChange={setShowPDFPreview}
                    subject={subject}
                    comparables={comparables}
                    valuationResult={result}
                    overpriced={overpriced}
                    marketImageLabels={marketImageLabels}
                    marketImageUrls={marketImageUrls}
                />
            )}
        </div>
    )
}

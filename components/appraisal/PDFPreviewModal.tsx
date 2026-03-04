'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, Loader2 } from 'lucide-react'
import { ValuationProperty, ValuationResult } from '@/lib/valuation/calculator'
import { PDFReportDocument } from './pdf/PDFReport'
import { pdf } from '@react-pdf/renderer'
import { convertImagesToBase64 } from '@/lib/pdf/imageUtils'

// Dynamic import of PDFViewer — browser-only, no SSR
const PDFViewer = dynamic(
    () => import('@react-pdf/renderer').then(mod => mod.PDFViewer),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }
)

interface PDFPreviewModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    subject: ValuationProperty
    comparables: ValuationProperty[]
    valuationResult: ValuationResult
    overpriced?: ValuationProperty[]
}

export function PDFPreviewModal({
    open,
    onOpenChange,
    subject,
    comparables,
    valuationResult,
    overpriced = []
}: PDFPreviewModalProps) {
    const [isDownloading, setIsDownloading] = useState(false)
    const [isConverting, setIsConverting] = useState(false)
    const [convertedSubject, setConvertedSubject] = useState<ValuationProperty | null>(null)
    const [convertedComparables, setConvertedComparables] = useState<ValuationProperty[] | null>(null)
    const [convertedOverpriced, setConvertedOverpriced] = useState<ValuationProperty[] | null>(null)

    // Convert images when modal opens
    useEffect(() => {
        if (!open) {
            setConvertedSubject(null)
            setConvertedComparables(null)
            setConvertedOverpriced(null)
            return
        }

        let cancelled = false
        setIsConverting(true)

        convertImagesToBase64(subject, comparables, overpriced).then(({ subjectImages, comparableImages, overpricedImages }) => {
            if (cancelled) return

            setConvertedSubject({ ...subject, images: subjectImages })
            setConvertedComparables(comparables.map((comp, i) => ({
                ...comp,
                images: comparableImages[i] || comp.images || [],
            })))
            setConvertedOverpriced(overpriced.map((prop, i) => ({
                ...prop,
                images: overpricedImages[i] || prop.images || [],
            })))
            setIsConverting(false)
        }).catch(() => {
            if (cancelled) return
            setConvertedSubject(subject)
            setConvertedComparables(comparables)
            setConvertedOverpriced(overpriced)
            setIsConverting(false)
        })

        return () => { cancelled = true }
    }, [open, subject, comparables, overpriced])

    const readySubject = convertedSubject || subject
    const readyComparables = convertedComparables || comparables
    const readyOverpriced = convertedOverpriced || overpriced

    const handleDownload = useCallback(async () => {
        setIsDownloading(true)
        try {
            const doc = (
                <PDFReportDocument
                    subject={readySubject}
                    comparables={readyComparables}
                    valuationResult={valuationResult}
                    overpriced={readyOverpriced}
                />
            )
            const blob = await pdf(doc).toBlob()
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            const propertyName = subject.title || subject.location || 'Propiedad'
            link.download = `Informe_Tasacion_${propertyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Error downloading PDF:', error)
            alert('Hubo un error al descargar el PDF. Por favor, intenta nuevamente.')
        } finally {
            setIsDownloading(false)
        }
    }, [readySubject, readyComparables, valuationResult, subject])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-[90vh] p-0 gap-0 [&>button]:hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/30">
                    <DialogTitle className="text-lg font-semibold">
                        Vista Previa del Informe
                    </DialogTitle>
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={handleDownload}
                            disabled={isDownloading || isConverting}
                            className="gap-2"
                        >
                            {isDownloading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="h-4 w-4" />
                            )}
                            Descargar PDF
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onOpenChange(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* PDF Viewer */}
                <div className="flex-1 overflow-hidden" style={{ height: 'calc(90vh - 56px)' }}>
                    {isConverting ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Preparando imagenes...</p>
                        </div>
                    ) : (
                        <PDFViewer width="100%" height="100%" showToolbar={false}>
                            <PDFReportDocument
                                subject={readySubject}
                                comparables={readyComparables}
                                valuationResult={valuationResult}
                                overpriced={readyOverpriced}
                            />
                        </PDFViewer>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

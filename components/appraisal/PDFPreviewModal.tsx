'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, Loader2, Edit3, Eye, LayoutGrid } from 'lucide-react'
import { ReportEditor } from './ReportEditor'
import { DEFAULT_REPORT_EDITS } from '@/lib/types/report-edits'
import { ValuationProperty, ValuationResult, PurchaseResult } from '@/lib/valuation/calculator'
import { buildAppraisalFilename } from '@/lib/valuation/utils'
import { ReportEdits } from '@/lib/types/report-edits'
import { saveReportEdits } from '@/lib/supabase/appraisals'
import { buildPdfWithLayout, resolveSavedLayout, getPdfPageCount, layoutChangesAnything } from '@/lib/pdf/applyPageLayout'
import type { PageLayoutState } from './pdf/PageOrganizer'
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

// PageOrganizer carga pdfjs-dist (pesado) — solo se importa al abrir el tab Organizar.
const PageOrganizer = dynamic(
    () => import('./pdf/PageOrganizer').then(mod => mod.PageOrganizer),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }
)

// Module-level cache for market image settings so it's fetched only once per session
type MarketImageCache = {
    labels: Record<string, { label: string; description: string }>
    urls: Record<string, string>
}
let marketImageCache: MarketImageCache | null = null
let marketImageCachePromise: Promise<MarketImageCache> | null = null

// Referencias estables para defaults — sin esto, el destructuring default `= []`
// crea un array nuevo en cada render del modal, lo que invalida las deps del
// useEffect de conversión de imágenes y causa un loop infinito que tilda el tab.
const EMPTY_PROPERTIES: ValuationProperty[] = []

async function loadMarketImageSettings(): Promise<MarketImageCache> {
    if (marketImageCache) return marketImageCache
    if (marketImageCachePromise) return marketImageCachePromise
    marketImageCachePromise = fetch('/api/settings/market-images')
        .then(res => res.json())
        .then(data => {
            const labels: Record<string, { label: string; description: string }> = {}
            const urls: Record<string, string> = {}
            for (const slot of (data.slots || [])) {
                labels[slot.id] = { label: slot.label, description: slot.description || '' }
                if (slot.currentPath) urls[slot.id] = slot.currentPath
            }
            marketImageCache = { labels, urls }
            return marketImageCache
        })
        .catch(() => {
            const empty: MarketImageCache = { labels: {}, urls: {} }
            marketImageCache = empty
            return empty
        })
    return marketImageCachePromise
}

interface PDFPreviewModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Si está presente, los ajustes del informe (textos, precios, layout de páginas)
     *  se guardan en la tasación vía PATCH. Si falta, solo se aplican para la descarga. */
    appraisalId?: string
    subject: ValuationProperty
    comparables: ValuationProperty[]
    valuationResult: ValuationResult
    overpriced?: ValuationProperty[]
    purchaseProperties?: ValuationProperty[]
    purchaseResult?: PurchaseResult
    marketImageLabels?: Record<string, { label: string; description: string }>
    marketImageUrls?: Record<string, string>
    reportEdits?: ReportEdits
    onReportEditsChange?: (edits: ReportEdits) => void
    appraisalDate?: string
    advisorPhotoUrl?: string
}

export function PDFPreviewModal({
    open,
    onOpenChange,
    appraisalId,
    subject,
    comparables,
    valuationResult,
    overpriced = EMPTY_PROPERTIES,
    purchaseProperties = EMPTY_PROPERTIES,
    purchaseResult,
    marketImageLabels,
    marketImageUrls,
    reportEdits,
    onReportEditsChange,
    appraisalDate,
    advisorPhotoUrl,
}: PDFPreviewModalProps) {
    const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'organize'>('preview')
    const [isDownloading, setIsDownloading] = useState(false)
    const [isConverting, setIsConverting] = useState(false)
    const [convertedSubject, setConvertedSubject] = useState<ValuationProperty | null>(null)
    const [convertedComparables, setConvertedComparables] = useState<ValuationProperty[] | null>(null)
    const [convertedOverpriced, setConvertedOverpriced] = useState<ValuationProperty[] | null>(null)
    const [convertedPurchase, setConvertedPurchase] = useState<ValuationProperty[] | null>(null)

    // Editor de páginas
    const [organizerBytes, setOrganizerBytes] = useState<ArrayBuffer | null>(null)
    const [pageLayout, setPageLayout] = useState<PageLayoutState | null>(null)
    const [savePermanent, setSavePermanent] = useState<boolean>(() => !!reportEdits?.pdfLayout)

    // Lazy-loaded market image settings (only fetched when modal opens, cached)
    const [lazyLabels, setLazyLabels] = useState<Record<string, { label: string; description: string }> | null>(null)
    const [lazyUrls, setLazyUrls] = useState<Record<string, string> | null>(null)

    useEffect(() => {
        if (!open) return
        if (marketImageLabels && marketImageUrls && Object.keys(marketImageUrls).length > 0) return
        let cancelled = false
        loadMarketImageSettings().then(({ labels, urls }) => {
            if (cancelled) return
            setLazyLabels(labels)
            setLazyUrls(urls)
        })
        return () => { cancelled = true }
    }, [open, marketImageLabels, marketImageUrls])

    const effectiveLabels = (marketImageLabels && Object.keys(marketImageLabels).length > 0) ? marketImageLabels : (lazyLabels || undefined)
    const effectiveUrls = (marketImageUrls && Object.keys(marketImageUrls).length > 0) ? marketImageUrls : (lazyUrls || undefined)

    // Convert images when modal opens
    useEffect(() => {
        if (!open) {
            setConvertedSubject(null)
            setConvertedComparables(null)
            setConvertedOverpriced(null)
            setConvertedPurchase(null)
            return
        }

        let cancelled = false
        setIsConverting(true)

        convertImagesToBase64(subject, comparables, overpriced, purchaseProperties)
            .then(({ subjectImages, comparableImages, overpricedImages, purchaseImages }) => {
                if (cancelled) return
                setConvertedSubject({ ...subject, images: subjectImages })
                setConvertedComparables(comparables.map((comp, i) => ({ ...comp, images: comparableImages[i] || comp.images || [] })))
                setConvertedOverpriced(overpriced.map((prop, i) => ({ ...prop, images: overpricedImages[i] || prop.images || [] })))
                setConvertedPurchase(purchaseProperties.map((prop, i) => ({ ...prop, images: purchaseImages[i] || prop.images || [] })))
                setIsConverting(false)
            })
            .catch(() => {
                if (cancelled) return
                setConvertedSubject(subject)
                setConvertedComparables(comparables)
                setConvertedOverpriced(overpriced)
                setConvertedPurchase(purchaseProperties)
                setIsConverting(false)
            })

        return () => { cancelled = true }
    }, [open, subject, comparables, overpriced, purchaseProperties])

    const readySubject = convertedSubject || subject
    const readyComparables = convertedComparables || comparables
    const readyOverpriced = convertedOverpriced || overpriced
    const readyPurchase = convertedPurchase || purchaseProperties

    // Documento único usado por preview, descarga y editor de páginas.
    const buildDoc = useCallback(() => (
        <PDFReportDocument
            subject={readySubject}
            comparables={readyComparables}
            valuationResult={valuationResult}
            overpriced={readyOverpriced}
            purchaseProperties={readyPurchase}
            purchaseResult={purchaseResult}
            marketImageLabels={effectiveLabels}
            marketImageUrls={effectiveUrls}
            reportEdits={reportEdits}
            appraisalDate={appraisalDate}
            advisorPhotoUrl={advisorPhotoUrl}
        />
    ), [readySubject, readyComparables, valuationResult, readyOverpriced, readyPurchase, purchaseResult, effectiveLabels, effectiveUrls, reportEdits, appraisalDate, advisorPhotoUrl])

    // --- Persistencia de reportEdits (textos + precios + layout) ---
    const reportEditsRef = useRef(reportEdits)
    reportEditsRef.current = reportEdits
    const buildDocRef = useRef(buildDoc)
    buildDocRef.current = buildDoc
    const hasEditedRef = useRef(false)
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!appraisalId || !hasEditedRef.current || !reportEdits) return
        if (persistTimer.current) clearTimeout(persistTimer.current)
        const edits = reportEdits
        persistTimer.current = setTimeout(() => {
            saveReportEdits(appraisalId, edits).catch(e => console.error('[PDFPreviewModal] saveReportEdits', e))
        }, 800)
        return () => { if (persistTimer.current) clearTimeout(persistTimer.current) }
    }, [reportEdits, appraisalId])

    // Flush al desmontar: si quedó una edición sin guardar (cambio < 800ms antes de
    // cerrar el modal), la persistimos para no perderla.
    useEffect(() => () => {
        if (appraisalId && hasEditedRef.current && reportEditsRef.current) {
            saveReportEdits(appraisalId, reportEditsRef.current).catch(e => console.error('[PDFPreviewModal] flush saveReportEdits', e))
        }
    }, [appraisalId])

    const handleEditorChange = useCallback((edits: ReportEdits) => {
        hasEditedRef.current = true
        onReportEditsChange?.(edits)
    }, [onReportEditsChange])

    // Escribe (o limpia) reportEdits.pdfLayout. Llamado desde handlers, nunca desde efectos.
    const commitLayout = useCallback((layout: PageLayoutState | null) => {
        const current = reportEditsRef.current || DEFAULT_REPORT_EDITS
        const next = layout || undefined
        if (JSON.stringify(current.pdfLayout) === JSON.stringify(next)) return
        hasEditedRef.current = true
        onReportEditsChange?.({ ...current, pdfLayout: next })
    }, [onReportEditsChange])

    const handleLayoutChange = useCallback((layout: PageLayoutState) => {
        setPageLayout(layout)
        if (savePermanent) commitLayout(layout)
    }, [savePermanent, commitLayout])

    const handleToggleSavePermanent = useCallback((checked: boolean) => {
        setSavePermanent(checked)
        commitLayout(checked ? pageLayout : null)
    }, [pageLayout, commitLayout])

    const savedLayout = useMemo(() => reportEdits?.pdfLayout ?? null, [reportEdits?.pdfLayout])

    // Construir bytes para el editor de páginas al entrar al tab (con reportEdits actual).
    useEffect(() => {
        if (activeTab !== 'organize' || isConverting) return
        let cancelled = false
        setOrganizerBytes(null)
        ;(async () => {
            try {
                const blob = await pdf(buildDocRef.current()).toBlob()
                const buf = await blob.arrayBuffer()
                if (!cancelled) setOrganizerBytes(buf)
            } catch (e) {
                console.error('[PDFPreviewModal] build organizer bytes', e)
            }
        })()
        return () => { cancelled = true }
    }, [activeTab, isConverting])

    const handleDownload = useCallback(async () => {
        setIsDownloading(true)
        try {
            const blob = await pdf(buildDoc()).toBlob()
            const ab = await blob.arrayBuffer()

            // Resolver el layout efectivo: el de la sesión (organizer) o el guardado.
            let visible: number[] | null = null
            if (pageLayout && layoutChangesAnything(pageLayout.order, pageLayout.hidden)) {
                visible = pageLayout.order.filter(i => !pageLayout.hidden.includes(i))
            } else if (reportEdits?.pdfLayout) {
                const count = await getPdfPageCount(ab)
                const resolved = resolveSavedLayout(reportEdits.pdfLayout, count)
                if (resolved && layoutChangesAnything(reportEdits.pdfLayout.order, reportEdits.pdfLayout.hidden)) {
                    visible = resolved
                }
            }

            let outBlob: Blob = blob
            if (visible && visible.length > 0) {
                const outBytes = await buildPdfWithLayout(ab, visible)
                outBlob = new Blob([outBytes as BlobPart], { type: 'application/pdf' })
            }
            const url = URL.createObjectURL(outBlob)
            const link = document.createElement('a')
            link.href = url
            const propertyName = subject.title || subject.location || 'Propiedad'
            link.download = buildAppraisalFilename(propertyName)
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
    }, [buildDoc, pageLayout, reportEdits, subject])

    const tabTitle = activeTab === 'editor' ? 'Editar Informe' : activeTab === 'organize' ? 'Organizar Páginas' : 'Vista Previa PDF'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-[90vh] p-0 gap-0 [&>button]:hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/30">
                    <DialogTitle className="text-lg font-semibold">{tabTitle}</DialogTitle>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-muted rounded-lg p-0.5 mr-2">
                            <button
                                onClick={() => setActiveTab('editor')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${activeTab === 'editor' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <Edit3 className="h-3.5 w-3.5" />
                                Editar
                            </button>
                            <button
                                onClick={() => setActiveTab('preview')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${activeTab === 'preview' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <Eye className="h-3.5 w-3.5" />
                                Vista Previa
                            </button>
                            <button
                                onClick={() => setActiveTab('organize')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${activeTab === 'organize' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <LayoutGrid className="h-3.5 w-3.5" />
                                Organizar
                            </button>
                        </div>
                        <Button onClick={handleDownload} disabled={isDownloading || isConverting} className="gap-2">
                            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Descargar PDF
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Content area */}
                <div className="flex-1 overflow-hidden" style={{ height: 'calc(90vh - 56px)' }}>
                    {activeTab === 'editor' ? (
                        <div className="h-full overflow-y-auto">
                            <ReportEditor
                                subject={subject}
                                comparables={comparables}
                                overpriced={overpriced}
                                purchaseProperties={readyPurchase}
                                valuationResult={valuationResult}
                                purchaseResult={purchaseResult}
                                reportEdits={reportEdits || DEFAULT_REPORT_EDITS}
                                onReportEditsChange={handleEditorChange}
                            />
                        </div>
                    ) : activeTab === 'organize' ? (
                        <div className="h-full overflow-y-auto">
                            <div className="mx-auto max-w-5xl px-6 pt-4">
                                <label className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={savePermanent}
                                        disabled={!appraisalId}
                                        onChange={e => handleToggleSavePermanent(e.target.checked)}
                                    />
                                    <span>
                                        Guardar este orden en la propiedad
                                        {!appraisalId && <span className="text-muted-foreground"> (solo disponible en tasaciones guardadas)</span>}
                                    </span>
                                </label>
                                <p className="mt-1 px-1 text-[11px] text-muted-foreground">
                                    {savePermanent
                                        ? 'El orden quedará guardado y se aplicará a futuras descargas de esta tasación.'
                                        : 'Los cambios se aplican solo a la descarga de ahora.'}
                                </p>
                            </div>
                            {isConverting || !organizerBytes ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-20">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <p className="text-sm text-muted-foreground">Preparando páginas…</p>
                                </div>
                            ) : (
                                <PageOrganizer
                                    pdfBytes={organizerBytes}
                                    savedLayout={savedLayout}
                                    onLayoutChange={handleLayoutChange}
                                />
                            )}
                        </div>
                    ) : isConverting ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Preparando imagenes...</p>
                        </div>
                    ) : (
                        <PDFViewer width="100%" height="100%" showToolbar={false}>
                            {buildDoc()}
                        </PDFViewer>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

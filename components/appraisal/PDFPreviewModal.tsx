'use client'

import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode } from 'react'
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
// NOTA: lib/pdf/applyPageLayout (que importa pdf-lib) se carga LAZY dentro de
// handleDownload — NO estático — para que pdf-lib NO esté en el chunk del modal
// cuando @react-pdf renderiza la Vista Previa. Co-bundlear pdf-lib con el render de
// @react-pdf rompía el reconciler en el browser ("n1 is not a function").
import { flushSync } from 'react-dom'
import type { PageLayoutState } from './pdf/PageOrganizer'
import { PDFReportDocument } from './pdf/PDFReport'
import { pdf } from '@react-pdf/renderer'
import { convertImagesToBase64 } from '@/lib/pdf/imageUtils'
import type { MarketDataForReport } from '@/lib/market-data/types'

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

// Error boundary local: si el render de cualquier tab falla, mostramos un mensaje
// en vez de tumbar TODA la app (Next global error / pantalla en blanco).
class PreviewErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state: { error: Error | null } = { error: null }
    static getDerivedStateFromError(error: Error) { return { error } }
    componentDidCatch(error: Error, info: { componentStack?: string }) {
        console.error('[PDFPreviewModal] render error:', error?.message, '\ncomponentStack:', info?.componentStack, '\n', error)
    }
    render() {
        if (this.state.error) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                    <p className="text-sm font-medium text-red-600">No se pudo mostrar esta sección del informe.</p>
                    <p className="max-w-lg text-xs text-muted-foreground break-words">{this.state.error.message}</p>
                    <p className="text-[11px] text-muted-foreground">Probá recargar la página. Si persiste, avisanos.</p>
                </div>
            )
        }
        return this.props.children
    }
}

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
    marketData?: MarketDataForReport | null
    neighborhoodName?: string
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
    marketData,
    neighborhoodName,
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
            marketData={marketData}
            neighborhoodName={neighborhoodName}
        />
    ), [readySubject, readyComparables, valuationResult, readyOverpriced, readyPurchase, purchaseResult, effectiveLabels, effectiveUrls, reportEdits, appraisalDate, advisorPhotoUrl, marketData, neighborhoodName])

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
        // flushSync: DESMONTAR el PDFViewer ANTES de arrancar el render del blob.
        // Dos renders de @react-pdf co-presentes (visor montado + pdf().toBlob())
        // comparten estado interno del motor y corrompen el visor vivo → el mismo
        // "n1 is not a function" del host-config sin detachDeletedInstance. Con el
        // visor desmontado durante la descarga, nunca hay co-presencia.
        flushSync(() => setIsDownloading(true))
        try {
            // @react-pdf PRIMERO (genera el blob), recién DESPUÉS cargamos pdf-lib (lazy)
            // para post-procesar. Así pdf-lib nunca está co-presente con el render de
            // @react-pdf (ver nota del import arriba).
            const blob = await pdf(buildDoc()).toBlob()
            const ab = await blob.arrayBuffer()

            const { buildPdfWithLayout, resolveSavedLayout, getPdfPageCount, layoutChangesAnything } = await import('@/lib/pdf/applyPageLayout')

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
            <DialogContent className="flex flex-col max-w-[95vw] max-h-[95vh] w-full h-[90vh] p-0 gap-0 [&>button]:hidden">
                {/* Toolbar — responsive: título solo a11y (sr-only); tabs y botón pasan a
                    íconos en pantallas chicas para que nunca se desborde / se parta. */}
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 border-b bg-muted/30">
                    <DialogTitle className="sr-only">{tabTitle}</DialogTitle>
                    <div className="flex shrink-0 bg-muted rounded-lg p-0.5">
                        <button
                            onClick={() => setActiveTab('editor')}
                            title="Editar"
                            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-sm rounded-md transition-all ${activeTab === 'editor' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Edit3 className="h-3.5 w-3.5 shrink-0" />
                            <span className="hidden md:inline">Editar</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('preview')}
                            title="Vista Previa"
                            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-sm rounded-md transition-all ${activeTab === 'preview' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Eye className="h-3.5 w-3.5 shrink-0" />
                            <span className="hidden md:inline">Vista Previa</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('organize')}
                            title="Organizar"
                            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-sm rounded-md transition-all ${activeTab === 'organize' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                            <span className="hidden md:inline">Organizar</span>
                        </button>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                        <Button onClick={handleDownload} disabled={isDownloading || isConverting} title="Descargar PDF" className="gap-1.5 px-2.5 sm:px-4">
                            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            <span className="hidden sm:inline">Descargar PDF</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="shrink-0">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Content area */}
                <div className="flex-1 min-h-0 overflow-hidden">
                    <PreviewErrorBoundary key={activeTab}>
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
                    ) : isDownloading ? (
                        /* Visor DESMONTADO durante la descarga (ver comentario en
                           handleDownload): evita la co-presencia de dos renders de
                           @react-pdf que corrompía el visor vivo. Al terminar, el
                           visor remonta fresco solo. */
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Generando el PDF para descargar...</p>
                        </div>
                    ) : (
                        <PDFViewer
                            /* CAUSA RAÍZ del crash "n1 is not a function" (2026-07-06, y el histórico):
                               el host-config de @react-pdf NO implementa `detachDeletedInstance`, pero el
                               reconciler de React lo llama al ELIMINAR nodos en un update en vivo. Un
                               render fresco nunca elimina nada; un cambio ESTRUCTURAL del documento con
                               el visor montado (ej.: marketData llega por fetch ~1s después de que la
                               conversión de imágenes ya montó el visor → legacy 2 págs → data-driven) sí.
                               FIX: `key` con los insumos estructurales async → al cambiar, React
                               desmonta y remonta el visor completo (camino seguro, igual que cambiar de
                               tab) en vez de difear en el lugar. NO quitar este key. */
                            key={`${marketData ? `md-${marketData.neighborhood.slug}-${marketData.resolvedPeriod}` : 'legacy'}|${advisorPhotoUrl || 'def'}`}
                            width="100%" height="100%" showToolbar={false}>
                            {/* Preview = código ORIGINAL exacto (inline, props crudas de market
                                images). NO usa buildDoc/effectiveLabels: ese cambio en el render
                                en vivo del PDFViewer era el que rompía. La descarga sí usa
                                effectiveLabels (igual que siempre). */}
                            <PDFReportDocument
                                subject={readySubject}
                                comparables={readyComparables}
                                valuationResult={valuationResult}
                                overpriced={readyOverpriced}
                                purchaseProperties={readyPurchase}
                                purchaseResult={purchaseResult}
                                marketImageLabels={marketImageLabels}
                                marketImageUrls={marketImageUrls}
                                reportEdits={reportEdits}
                                appraisalDate={appraisalDate}
                                advisorPhotoUrl={advisorPhotoUrl}
                                marketData={marketData}
                                neighborhoodName={neighborhoodName}
                            />
                        </PDFViewer>
                    )}
                    </PreviewErrorBoundary>
                </div>
            </DialogContent>
        </Dialog>
    )
}

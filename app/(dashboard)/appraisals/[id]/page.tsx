'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { AppraisalDetail } from '@/lib/supabase/appraisals'
import { updateAppraisal } from '@/lib/supabase/appraisals'
import { ValuationReport } from '@/components/appraisal/ValuationReport'
import { PDFDownloadButton } from '@/components/appraisal/PDFDownloadButton'
import { ValuationProperty, ValuationResult, calculateValuation, getQualityCoefficient, ExpenseRates } from '@/lib/valuation/calculator'
import { ReportEdits, buildDefaultEdits } from '@/lib/types/report-edits'
import type { PropertyFeatures, ScrapedProperty } from '@/lib/scraper/types'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileText, AlertCircle, Edit2, Loader2, UserCog } from 'lucide-react'
import { ContactEditor } from '@/components/contacts/ContactEditor'

const PDFPreviewModal = dynamic(
    () => import('@/components/appraisal/PDFPreviewModal').then(m => m.PDFPreviewModal),
    { ssr: false }
)

export default function AppraisalDetailPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const [appraisal, setAppraisal] = useState<AppraisalDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showPDFPreview, setShowPDFPreview] = useState(false)
    const [contactEditorOpen, setContactEditorOpen] = useState(false)
    const [reportEdits, setReportEdits] = useState<ReportEdits | null>(null)
    const [subjectFeaturesOverride, setSubjectFeaturesOverride] = useState<PropertyFeatures | null>(null)
    const [valuationOverride, setValuationOverride] = useState<ValuationResult | null>(null)
    const [savingFeatures, setSavingFeatures] = useState(false)

    // Market image settings are loaded lazily by PDFPreviewModal on open

    function loadAppraisal() {
        const id = params.id as string
        if (!id) return
        return fetch(`/api/appraisals/${id}`)
            .then(r => {
                if (!r.ok) throw new Error('Not found')
                return r.json()
            })
            .then(({ data }) => {
                if (!data) setError('Tasación no encontrada')
                else setAppraisal(data as AppraisalDetail)
            })
            .catch(err => {
                console.error('Error loading appraisal:', err)
                setError('Error al cargar la tasación')
            })
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        loadAppraisal()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id])

    // Si llegamos con ?editContact=1 (típicamente desde tasks), abrimos el editor.
    useEffect(() => {
        if (searchParams.get('editContact') === '1') setContactEditorOpen(true)
    }, [searchParams])

    // CRÍTICO: los useMemo deben llamarse SIEMPRE — antes de cualquier early
    // return — porque las reglas de hooks de React requieren orden estable.
    // Manejamos el caso `appraisal === null` con fallbacks adentro.
    const effectiveFeatures: PropertyFeatures | null =
        subjectFeaturesOverride ?? (appraisal?.property_features ?? null)

    const subject: ValuationProperty | null = useMemo(() => {
        if (!appraisal) return null
        return {
            price: appraisal.property_price,
            currency: appraisal.property_currency,
            title: appraisal.property_title || undefined,
            location: appraisal.property_location,
            images: appraisal.property_images || undefined,
            description: appraisal.property_description || undefined,
            features: (effectiveFeatures ?? {}) as unknown as ValuationProperty['features'],
        }
    }, [appraisal, effectiveFeatures])

    const { comparables, overpriced, purchaseProperties } = useMemo<{
        comparables: ValuationProperty[]
        overpriced: ValuationProperty[]
        purchaseProperties: ValuationProperty[]
    }>(() => {
        if (!appraisal) return { comparables: [], overpriced: [], purchaseProperties: [] }

        const normalComps = appraisal.comparables.filter(c => {
            const analysis = c.analysis as Record<string, unknown> | null
            return analysis?.propertyType !== 'overpriced' && analysis?.propertyType !== 'purchase'
        })
        const overpricedComps = appraisal.comparables.filter(c => {
            const analysis = c.analysis as Record<string, unknown> | null
            return analysis?.propertyType === 'overpriced'
        })
        const purchaseComps = appraisal.comparables.filter(c => {
            const analysis = c.analysis as Record<string, unknown> | null
            return analysis?.propertyType === 'purchase'
        })

        const mapToValuation = (c: typeof appraisal.comparables[number]): ValuationProperty => ({
            price: c.price,
            currency: c.currency,
            title: c.title || undefined,
            location: c.location || undefined,
            url: c.url || undefined,
            images: c.images || undefined,
            description: c.description || undefined,
            features: c.features,
        })

        return {
            comparables: normalComps.map(mapToValuation),
            overpriced: overpricedComps.map(mapToValuation),
            purchaseProperties: purchaseComps.map(mapToValuation),
        }
    }, [appraisal])

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

    if (error || !appraisal || !subject) {
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

    const result: ValuationResult = valuationOverride ?? (appraisal.valuation_result || {} as ValuationResult)
    const hasFullValuation = result.subjectSurface != null && result.comparableAnalysis?.length > 0

    // Detect coefficient drift: tasaciones guardadas antes del fix tenían subjectQualityCoef = 1.0 hardcoded.
    // El nuevo cálculo usa el coeficiente real según features.quality del subject.
    const subjectQuality = appraisal.property_features?.quality
    const expectedQualityCoef = getQualityCoefficient(subjectQuality)
    const storedQualityCoef = result?.subjectQualityCoef
    const qualityCoefficientChanged =
        typeof storedQualityCoef === 'number' &&
        Math.abs(storedQualityCoef - expectedQualityCoef) > 0.01

    async function handleSubjectFeaturesChange(features: PropertyFeatures) {
        if (!appraisal) return
        // Optimistic UI update
        setSubjectFeaturesOverride(features)
        setSavingFeatures(true)
        try {
            // Filter out overpriced AND purchase properties before recalculation —
            // only normal comparables contribute to the average $/m².
            const onlyNormalRows = appraisal.comparables.filter(c => {
                const a = c.analysis as Record<string, unknown> | null
                return a?.propertyType !== 'overpriced' && a?.propertyType !== 'purchase'
            })
            const recalc = calculateValuation({
                subject: { ...subject, features: features as unknown as ValuationProperty['features'] },
                comparables: onlyNormalRows.map(c => ({
                    price: c.price,
                    currency: c.currency,
                    title: c.title || undefined,
                    location: c.location || undefined,
                    features: c.features as ValuationProperty['features'],
                })),
                expenseRates: result?.expenseRates,
            })
            if (recalc) {
                const merged: ValuationResult = {
                    ...recalc,
                    purchaseResult: result?.purchaseResult,
                    purchaseScenarios: result?.purchaseScenarios,
                    selectedScenarioIds: result?.selectedScenarioIds,
                }
                setValuationOverride(merged)

                // Persist via updateAppraisal — we must rebuild the input shape
                // (subject as ScrapedProperty + comparables as ScrapedProperty[]).
                const subjectScraped: ScrapedProperty = {
                    url: appraisal.property_url || '',
                    title: appraisal.property_title || '',
                    price: appraisal.property_price,
                    currency: (appraisal.property_currency as 'USD' | 'ARS' | null) ?? null,
                    location: appraisal.property_location,
                    description: appraisal.property_description || '',
                    features,
                    images: appraisal.property_images || [],
                    portal: '',
                }
                const allComparablesScraped: ScrapedProperty[] = appraisal.comparables.map(c => ({
                    url: c.url || '',
                    title: c.title || '',
                    price: c.price,
                    currency: (c.currency as 'USD' | 'ARS' | null) ?? null,
                    location: c.location || '',
                    description: c.description || '',
                    features: c.features as PropertyFeatures,
                    images: c.images || [],
                    portal: '',
                }))
                // Split for updateAppraisal payload (it accepts overpriced/purchase separately).
                const normalScraped = allComparablesScraped.filter((_, i) => {
                    const a = appraisal.comparables[i].analysis as Record<string, unknown> | null
                    return a?.propertyType !== 'overpriced' && a?.propertyType !== 'purchase'
                })
                const overpricedScraped = allComparablesScraped.filter((_, i) => {
                    const a = appraisal.comparables[i].analysis as Record<string, unknown> | null
                    return a?.propertyType === 'overpriced'
                })
                const purchaseScraped = allComparablesScraped.filter((_, i) => {
                    const a = appraisal.comparables[i].analysis as Record<string, unknown> | null
                    return a?.propertyType === 'purchase'
                })

                await updateAppraisal(appraisal.id, {
                    subject: subjectScraped,
                    comparables: normalScraped,
                    overpriced: overpricedScraped,
                    purchaseProperties: purchaseScraped,
                    valuationResult: merged,
                })
            }
        } catch (err) {
            console.error('handleSubjectFeaturesChange error:', err)
        } finally {
            setSavingFeatures(false)
        }
    }

    async function handleExpenseRatesChange(next: Partial<ExpenseRates>) {
        if (!appraisal || !appraisal.valuation_result) return
        const currentRates = (valuationOverride?.expenseRates ?? appraisal.valuation_result.expenseRates) || {
            saleDiscountPercent: 5,
            deedDiscountPercent: 30,
            stampsPercent: 1.35,
            deedExpensesPercent: 1.5,
            agencyFeesPercent: 3,
        }
        const newRates: Required<ExpenseRates> = { ...currentRates, ...next } as Required<ExpenseRates>
        setSavingFeatures(true)
        try {
            // Filter out overpriced AND purchase properties — only normal comparables
            // contribute to the average $/m².
            const onlyNormalRows = appraisal.comparables.filter(c => {
                const a = c.analysis as Record<string, unknown> | null
                return a?.propertyType !== 'overpriced' && a?.propertyType !== 'purchase'
            })
            // En este punto subject e effectiveFeatures son no-null (early return
            // del render lo garantiza, y la función solo se llama desde JSX renderizado
            // post-early-return). Casts para satisfacer al type checker.
            const safeSubject = subject as ValuationProperty
            const safeFeatures = (effectiveFeatures ?? {}) as PropertyFeatures
            const recalc = calculateValuation({
                subject: safeSubject,
                comparables: onlyNormalRows.map(c => ({
                    price: c.price,
                    currency: c.currency,
                    title: c.title || undefined,
                    location: c.location || undefined,
                    features: c.features as ValuationProperty['features'],
                })),
                expenseRates: newRates,
            })
            if (recalc) {
                const merged: ValuationResult = {
                    ...recalc,
                    purchaseResult: result?.purchaseResult,
                    purchaseScenarios: result?.purchaseScenarios,
                    selectedScenarioIds: result?.selectedScenarioIds,
                }
                setValuationOverride(merged)

                // Persist via updateAppraisal — same payload-rebuilding pattern as
                // handleSubjectFeaturesChange.
                const subjectScraped: ScrapedProperty = {
                    url: appraisal.property_url || '',
                    title: appraisal.property_title || '',
                    price: appraisal.property_price,
                    currency: (appraisal.property_currency as 'USD' | 'ARS' | null) ?? null,
                    location: appraisal.property_location,
                    description: appraisal.property_description || '',
                    features: safeFeatures,
                    images: appraisal.property_images || [],
                    portal: '',
                }
                const allComparablesScraped: ScrapedProperty[] = appraisal.comparables.map(c => ({
                    url: c.url || '',
                    title: c.title || '',
                    price: c.price,
                    currency: (c.currency as 'USD' | 'ARS' | null) ?? null,
                    location: c.location || '',
                    description: c.description || '',
                    features: c.features as PropertyFeatures,
                    images: c.images || [],
                    portal: '',
                }))
                const normalScraped = allComparablesScraped.filter((_, i) => {
                    const a = appraisal.comparables[i].analysis as Record<string, unknown> | null
                    return a?.propertyType !== 'overpriced' && a?.propertyType !== 'purchase'
                })
                const overpricedScraped = allComparablesScraped.filter((_, i) => {
                    const a = appraisal.comparables[i].analysis as Record<string, unknown> | null
                    return a?.propertyType === 'overpriced'
                })
                const purchaseScraped = allComparablesScraped.filter((_, i) => {
                    const a = appraisal.comparables[i].analysis as Record<string, unknown> | null
                    return a?.propertyType === 'purchase'
                })

                await updateAppraisal(appraisal.id, {
                    subject: subjectScraped,
                    comparables: normalScraped,
                    overpriced: overpricedScraped,
                    purchaseProperties: purchaseScraped,
                    valuationResult: merged,
                })
            }
        } catch (err) {
            console.error('handleExpenseRatesChange error:', err)
        } finally {
            setSavingFeatures(false)
        }
    }

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

                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" className="gap-2" onClick={() => setContactEditorOpen(true)}>
                        <UserCog className="h-4 w-4" />
                        {appraisal.contact_id ? 'Editar Contacto' : 'Asignar Contacto'}
                    </Button>
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

            <ContactEditor
                open={contactEditorOpen}
                onOpenChange={setContactEditorOpen}
                contactId={appraisal.contact_id}
                appraisalId={appraisal.id}
                initial={{
                    full_name: appraisal.property_title || '',
                    origin: 'tasacion',
                }}
                onSaved={() => loadAppraisal()}
            />

            {/* Saving indicator */}
            {savingFeatures && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando cambios...
                </div>
            )}

            {/* Banner: coeficiente de calidad constructiva desactualizado */}
            {qualityCoefficientChanged && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
                    <strong className="text-amber-800">Aviso de actualización del motor de cálculo</strong>
                    <p className="mt-1 text-amber-700">
                        Esta tasación fue creada con un coeficiente de calidad constructiva fijo (1.0).
                        Al editar cualquier dato se recalculará usando el coeficiente real de la calidad
                        seleccionada ({subjectQuality ?? 'no definida'} = {expectedQualityCoef.toFixed(2)}).
                        Esto puede modificar el precio de publicación.
                    </p>
                </div>
            )}

            {/* Report */}
            {hasFullValuation ? (
                <ValuationReport
                    subject={subject}
                    result={result}
                    editable
                    onSubjectFeaturesChange={handleSubjectFeaturesChange}
                    expenseRates={(valuationOverride?.expenseRates ?? appraisal.valuation_result?.expenseRates) || undefined}
                    onExpenseRatesChange={handleExpenseRatesChange}
                />
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
                    purchaseProperties={purchaseProperties}
                    purchaseResult={result.purchaseResult}
                    reportEdits={reportEdits || buildDefaultEdits(
                        { title: appraisal.property_title || '', location: appraisal.property_location, description: appraisal.property_description || '' },
                        result
                    )}
                    onReportEditsChange={setReportEdits}
                    appraisalDate={appraisal.created_at}
                />
            )}
        </div>
    )
}

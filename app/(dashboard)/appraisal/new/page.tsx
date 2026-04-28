'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { PropertyWizard } from '@/components/appraisal/PropertyWizard'
import { PropertyForm } from '@/components/appraisal/PropertyForm'
import { ComparableEditor, ComparableMissingIndicator } from '@/components/appraisal/ComparableEditor'
import { ValuationReport } from '@/components/appraisal/ValuationReport'
import { ScrapedProperty, PropertyFeatures } from '@/lib/scraper/types'
import { calculateValuation, calculatePurchaseCosts, ValuationResult, ValuationProperty, ExpenseRates, PurchaseExpenseRates, PurchaseResult } from '@/lib/valuation/calculator'
import type { PurchaseScenarioId, PurchaseScenarioInput } from '@/lib/valuation/calculator'
import { buildDefaultScenarios, calculateAllScenarios } from '@/lib/valuation/purchase-scenarios'
import { PurchaseScenariosEditor } from '@/components/appraisal/PurchaseScenariosEditor'
import { ReportEdits, DEFAULT_REPORT_EDITS, buildDefaultEdits } from '@/lib/types/report-edits'
import { saveAppraisal, updateAppraisal, getAppraisal } from '@/lib/supabase/appraisals'
import { mapDealToWizardInitialData, hasSaleVisitPrefill } from '@/lib/mapping/visit-to-wizard'
import { Button } from '@/components/ui/button'
import {
    Calculator,
    FileCheck,
    FileText,
    Printer,
    ArrowRight,
    Plus,
    Trash2,
    Edit2,
    CheckCircle2,
    Home,
    Layers,
    Loader2,
    CheckCheck,
    AlertCircle,
    TrendingDown,
    ShoppingBag
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'

const PDFPreviewModal = dynamic(
    () => import('@/components/appraisal/PDFPreviewModal').then(m => m.PDFPreviewModal),
    { ssr: false }
)

// Map an existing ScrapedProperty back to PropertyWizard's initialData shape.
// Splits "address, neighborhood, city" from location if possible; otherwise
// falls back to putting the whole location in the address field.
function mapSubjectToFormData(subject: ScrapedProperty): Record<string, unknown> {
    const f = subject.features || {}
    const parts = (subject.location || '').split(',').map(s => s.trim()).filter(Boolean)
    const address = subject.title || parts[0] || ''
    const neighborhood = parts[1] || ''
    const city = parts.slice(2).join(', ') || ''
    return {
        address,
        neighborhood,
        city,
        coveredArea: (f as any).coveredArea ?? '',
        semiCoveredArea: (f as any).semiCoveredArea ?? '',
        uncoveredArea: (f as any).uncoveredArea ?? '',
        totalArea: (f as any).totalArea ?? '',
        rooms: (f as any).rooms ?? '',
        bedrooms: (f as any).bedrooms ?? '',
        bathrooms: (f as any).bathrooms ?? '',
        garages: (f as any).garages ?? '',
        floor: (f as any).floor ?? '',
        totalFloors: (f as any).totalFloors ?? '',
        age: (f as any).age ?? '',
        disposition: (f as any).disposition ?? '',
        quality: (f as any).quality ?? '',
        conservationState: (f as any).conservationState ?? '',
        images: subject.images || [],
    }
}

export default function NewAppraisalPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <NewAppraisalPageContent />
        </Suspense>
    )
}

function NewAppraisalPageContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const editId = searchParams.get('editId')
    const dealId = searchParams.get('dealId')
    const editMode = Boolean(editId)
    // Local fallback for the saved id, used between the moment we INSERT and
    // the moment React picks up the new editId from the URL replace.
    const [savedAppraisalId, setSavedAppraisalId] = useState<string | null>(editId)

    // Synchronous ref for the latest persisted id — avoids race condition with
    // setSavedAppraisalId being asynchronous when the recalc useEffect fires.
    const savedAppraisalIdRef = useRef<string | null>(editId || null)
    // Debounce timer for auto-save on rate/feature edits
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [subject, setSubject] = useState<ScrapedProperty | null>(null)
    const [comparables, setComparables] = useState<ScrapedProperty[]>([])
    const [overpriced, setOverpriced] = useState<ScrapedProperty[]>([])
    const [valuationResult, setValuationResult] = useState<ValuationResult | null>(null)

    // Origin and assignment
    const [origin, setOrigin] = useState<string>('')
    const [assignedTo, setAssignedTo] = useState<string>('')
    const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])

    // Clear stale PropertyWizard draft when starting a fresh creation
    useEffect(() => {
        if (!editId) {
            localStorage.removeItem('propertyWizardDraft')
        }
    }, [editId])

    // Keep the ref in sync with whichever id is current (URL or in-session insert)
    useEffect(() => {
        savedAppraisalIdRef.current = editId || savedAppraisalId || null
    }, [editId, savedAppraisalId])

    // Cleanup any pending debounced save on unmount
    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        }
    }, [])

    // Load advisors list
    useEffect(() => {
        fetch('/api/users/advisors')
            .then(res => res.ok ? res.json() : { data: [] })
            .then(json => setAdvisors(json.data || []))
            .catch(() => {})
    }, [])

    // Deal pre-load state (when creating from a deal)
    const [dealData, setDealData] = useState<any>(null)
    const [dealLoading, setDealLoading] = useState(Boolean(dealId))

    useEffect(() => {
        if (!dealId) return
        setDealLoading(true)
        fetch(`/api/deals/${dealId}`)
            .then(r => r.json())
            .then(json => setDealData(json.data))
            .catch(err => console.error('Error loading deal:', err))
            .finally(() => setDealLoading(false))
    }, [dealId])

    // Edit mode state
    const [editLoading, setEditLoading] = useState(editMode)
    const [editLoadError, setEditLoadError] = useState<string | null>(null)
    const [isEditingSubject, setIsEditingSubject] = useState(false)

    // Modal states
    const [editingComparable, setEditingComparable] = useState<{ index: number; property: ScrapedProperty } | null>(null)
    const [pendingComparable, setPendingComparable] = useState<ScrapedProperty | null>(null)
    const [showPDFPreview, setShowPDFPreview] = useState(false)

    // Expense rates
    const [expenseRates, setExpenseRates] = useState<ExpenseRates>({
        saleDiscountPercent: 5,
        deedDiscountPercent: 30,
        stampsPercent: 1.35,
        deedExpensesPercent: 1.5,
        agencyFeesPercent: 3,
    })

    // Purchase properties
    const [purchaseProperties, setPurchaseProperties] = useState<ScrapedProperty[]>([])
    const [purchaseExpenseRates, setPurchaseExpenseRates] = useState<PurchaseExpenseRates>({
        purchaseDiscountPercent: 0,
        deedDiscountPercent: 30,
        stampsPercent: 1.75,
        notaryFeesPercent: 1,
        deedExpensesPercent: 1.75,
        buyerCommissionPercent: 4,
    })
    const [selectedPurchaseIndex, setSelectedPurchaseIndex] = useState<number | null>(null)
    const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null)

    // Escenarios de compra (Conservador / Medio / Agresivo)
    const [purchaseScenarios, setPurchaseScenarios] = useState<PurchaseScenarioInput[]>([])
    const [selectedScenarioIds, setSelectedScenarioIds] = useState<PurchaseScenarioId[]>([])

    // Inicializar escenarios cuando se agrega la primera propiedad de compra
    useEffect(() => {
        if (purchaseProperties.length > 0 && purchaseScenarios.length === 0) {
            const basePrice = purchaseProperties[0].price || 100000
            setPurchaseScenarios(buildDefaultScenarios(basePrice))
            setSelectedScenarioIds(['conservative', 'medium', 'aggressive'])
        }
    }, [purchaseProperties, purchaseScenarios.length])

    // Report edits (semaphores, text overrides)
    const [reportEdits, setReportEdits] = useState<ReportEdits>(DEFAULT_REPORT_EDITS)

    // Market image settings are loaded lazily by PDFPreviewModal itself when opened

    // Auto-save state
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

    // Load existing appraisal when in edit mode
    useEffect(() => {
        if (!editId) return
        let cancelled = false
        setEditLoading(true)
        setEditLoadError(null)
        getAppraisal(editId)
            .then(detail => {
                if (cancelled || !detail) {
                    if (!detail) setEditLoadError('Tasación no encontrada')
                    return
                }

                // Reconstruct subject as ScrapedProperty
                const reconstructedSubject: ScrapedProperty = {
                    title: detail.property_title ?? '',
                    location: detail.property_location,
                    description: detail.property_description ?? '',
                    url: detail.property_url ?? '',
                    price: detail.property_price ?? null,
                    currency: (detail.property_currency as 'USD' | 'ARS' | null) ?? null,
                    images: detail.property_images ?? [],
                    portal: 'manual',
                    features: detail.property_features || {},
                }

                // Split comparables vs overpriced vs purchase based on analysis.propertyType
                const normalComps: ScrapedProperty[] = []
                const overpricedComps: ScrapedProperty[] = []
                const purchaseComps: ScrapedProperty[] = []
                for (const c of detail.comparables) {
                    const mapped: ScrapedProperty = {
                        title: c.title ?? '',
                        location: c.location ?? '',
                        description: c.description ?? '',
                        url: c.url ?? '',
                        price: c.price ?? null,
                        currency: (c.currency as 'USD' | 'ARS' | null) ?? null,
                        images: c.images ?? [],
                        portal: 'manual',
                        features: c.features || {},
                    }
                    const analysisObj = c.analysis as Record<string, unknown> | null
                    if (analysisObj?.propertyType === 'overpriced') {
                        overpricedComps.push(mapped)
                    } else if (analysisObj?.propertyType === 'purchase') {
                        purchaseComps.push(mapped)
                    } else {
                        normalComps.push(mapped)
                    }
                }

                setSubject(reconstructedSubject)
                setComparables(normalComps)
                setOverpriced(overpricedComps)
                setPurchaseProperties(purchaseComps)
                setValuationResult(detail.valuation_result)

                // Restore purchaseResult if present
                if (detail.valuation_result?.purchaseResult) {
                    setPurchaseResult(detail.valuation_result.purchaseResult)
                }

                // Restore expenseRates from the stored result if present
                if (detail.valuation_result?.expenseRates) {
                    setExpenseRates(detail.valuation_result.expenseRates)
                }

                // Restore escenarios de compra if present
                if (detail.valuation_result?.purchaseScenarios) {
                    setPurchaseScenarios(detail.valuation_result.purchaseScenarios.map((s: any) => ({
                        id: s.id,
                        label: s.label,
                        publicationPrice: s.publicationPrice,
                        purchaseDiscountPercent: s.purchaseDiscountPercent,
                        deedDiscountPercent: s.deedDiscountPercent,
                        rates: s.rates,
                    })))
                }
                if (detail.valuation_result?.selectedScenarioIds) {
                    setSelectedScenarioIds(detail.valuation_result.selectedScenarioIds)
                }
            })
            .catch(err => {
                console.error('Error loading appraisal for edit:', err)
                if (!cancelled) setEditLoadError('Error al cargar la tasación')
            })
            .finally(() => {
                if (!cancelled) setEditLoading(false)
            })
        return () => { cancelled = true }
    }, [editId])

    function handleSubjectComplete(property: ScrapedProperty) {
        setSubject(property)
        // Scroll to comparables section
        setTimeout(() => {
            document.getElementById('comparables-section')?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
    }

    function handleComparableScraped(property: ScrapedProperty) {
        // Open editor modal to complete missing fields
        setPendingComparable(property)
    }

    function handleComparableSaved(property: ScrapedProperty) {
        if (editingComparable !== null) {
            // Updating existing
            const updated = [...comparables]
            updated[editingComparable.index] = property
            setComparables(updated)
            setEditingComparable(null)
        } else if (pendingComparable) {
            // Adding new
            setComparables([...comparables, property])
            setPendingComparable(null)
        }
    }

    function handleEditComparable(index: number) {
        setEditingComparable({ index, property: comparables[index] })
    }

    function handleRemoveComparable(index: number) {
        setComparables(comparables.filter((_, i) => i !== index))
    }

    // Live-edit handlers: update a single comparable's or subject's features
    // from the ValuationReport editable cells. The useEffect below re-runs the
    // calculation whenever these values change.
    function handleComparableFeaturesChange(index: number, newFeatures: Record<string, unknown>) {
        setComparables(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], features: newFeatures as any }
            return updated
        })
    }

    function handleSubjectFeaturesChange(newFeatures: PropertyFeatures) {
        setSubject(prev => prev ? { ...prev, features: newFeatures } : prev)
    }

    // Re-run calculation whenever subject/comparables/expenseRates change,
    // but ONLY if a valuationResult already exists (i.e. user has calculated at least once).
    // Do NOT depend on `valuationResult` here to avoid infinite loops.
    useEffect(() => {
        if (!valuationResult || !subject) return
        const subjectVal: ValuationProperty = {
            price: subject.price,
            currency: subject.currency,
            title: subject.title,
            location: subject.location,
            features: subject.features as any,
        }
        const compsVal: ValuationProperty[] = comparables.map(c => ({
            price: c.price,
            currency: c.currency,
            title: c.title,
            location: c.location,
            features: c.features as any,
        }))
        const next = calculateValuation({
            subject: subjectVal,
            comparables: compsVal,
            expenseRates,
        })
        if (!next) return
        // Calcular escenarios si los hay
        const scenarioResults = purchaseScenarios.length > 0
            ? calculateAllScenarios(purchaseScenarios, next.moneyInHand)
            : undefined
        // Preserve purchase data that lives outside calculateValuation
        const merged: ValuationResult = {
            ...next,
            purchaseResult: valuationResult.purchaseResult,
            purchaseScenarios: scenarioResults,
            selectedScenarioIds: scenarioResults ? selectedScenarioIds : valuationResult.selectedScenarioIds,
        }
        setValuationResult(merged)

        // Auto-save with 800ms debounce using the synchronous ref.
        // We DO NOT use savedAppraisalId state here because it's async and
        // may not be set yet when this effect fires right after handleCalculate.
        const persistedId = savedAppraisalIdRef.current
        if (!persistedId) return  // first INSERT is handled inside handleCalculate

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(() => {
            updateAppraisal(persistedId, {
                subject,
                comparables,
                overpriced,
                purchaseProperties,
                valuationResult: merged,
                origin: origin || undefined,
                assignedTo: assignedTo || undefined,
            }).catch(err => {
                console.error('[auto-save] updateAppraisal failed for id', persistedId, {
                    message: err?.message,
                    details: err?.details,
                    hint: err?.hint,
                    code: err?.code,
                    raw: err,
                })
            })
        }, 800)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subject, comparables, expenseRates, purchaseScenarios, selectedScenarioIds])

    function handleCalculate() {
        if (!subject) return

        // Convert ScrapedProperty to ValuationProperty format
        const subjectValuation: ValuationProperty = {
            price: subject.price,
            currency: subject.currency,
            title: subject.title,
            location: subject.location,
            features: subject.features as any
        }

        const comparablesValuation: ValuationProperty[] = comparables.map(c => ({
            price: c.price,
            currency: c.currency,
            title: c.title,
            location: c.location,
            features: c.features as any
        }))

        let result = calculateValuation({
            subject: subjectValuation,
            comparables: comparablesValuation,
            expenseRates,
        })

        // Calculate purchase costs if a purchase property is selected
        let pResult: PurchaseResult | undefined
        if (result && selectedPurchaseIndex !== null && purchaseProperties[selectedPurchaseIndex]) {
            const selectedPurchase = purchaseProperties[selectedPurchaseIndex]
            pResult = calculatePurchaseCosts(
                selectedPurchase.price || 0,
                selectedPurchase.title || selectedPurchase.location || 'Propiedad',
                result.moneyInHand,
                purchaseExpenseRates,
            )
            result = { ...result, purchaseResult: pResult }
            setPurchaseResult(pResult)
        } else {
            setPurchaseResult(null)
        }

        setValuationResult(result)

        // Pre-fill report edits with real data
        if (subject && result) {
            setReportEdits(buildDefaultEdits(
                { title: subject.title, location: subject.location, description: subject.description },
                { publicationPrice: result.publicationPrice, currency: result.currency, noSaleZonePrice: result.noSaleZonePrice }
            ))
        }

        // Scroll to results
        setTimeout(() => {
            document.getElementById('valuation-report')?.scrollIntoView({ behavior: 'smooth' })
        }, 100)

        // Auto-save to Supabase — update existing or create new based on mode.
        // CRITICAL: after the first INSERT we update the URL with ?editId=... so
        // every subsequent click on "Calcular" goes through updateAppraisal()
        // instead of creating a duplicate row.
        if (result) {
            setSaveStatus('saving')
            const payload = {
                subject, comparables, overpriced, purchaseProperties,
                valuationResult: result, origin: origin || undefined, assignedTo: assignedTo || undefined,
            }
            // Prefer the URL editId, fall back to the locally-tracked id from a
            // previous insert in this session. Either way, if we already have an
            // id we MUST update — never insert again.
            const existingId = editId || savedAppraisalId
            const isUpdate = Boolean(existingId)
            const promise = isUpdate
                ? updateAppraisal(existingId!, payload).then(() => existingId!)
                : saveAppraisal(payload)
            promise
                .then(async (appraisalId) => {
                    setSaveStatus('saved')

                    // First insert in this session: capture the new id and reflect
                    // it in the URL so future calcs are updates, not inserts.
                    if (!isUpdate && appraisalId) {
                        setSavedAppraisalId(appraisalId)
                        // Sync the ref synchronously — the recalc useEffect
                        // may fire before setSavedAppraisalId flushes to state.
                        savedAppraisalIdRef.current = appraisalId
                        const params = new URLSearchParams(searchParams.toString())
                        params.set('editId', appraisalId)
                        router.replace(`/appraisal/new?${params.toString()}`, { scroll: false })
                    }

                    // Side-effects (link to deal, auto-create deal) only run on
                    // the FIRST insert — guarded by !isUpdate to avoid creating
                    // multiple deals for the same appraisal across recalcs.
                    if (!isUpdate && appraisalId) {
                        // Link appraisal to deal without advancing stage (asesor marks it manually)
                        if (dealId) {
                            try {
                                await fetch(`/api/deals/${dealId}/link-appraisal`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ appraisal_id: appraisalId }),
                                })
                            } catch (e) { console.error('Error linking deal:', e) }
                        } else if (subject) {
                            // Auto-create deal for tasaciones without a process.
                            //
                            // Derive property fields from subject features so the auto-created deal
                            // passes /api/deals POST validation AND the deal's "Propiedad" card shows
                            // the data the asesor entered in the wizard.
                            try {
                                const features = (subject.features || {}) as any
                                // Try to extract neighborhood from the location string ("address, neighborhood, city")
                                const locationParts = (subject.location || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                                const neighborhood = locationParts[1] || locationParts[0] || 'Sin definir'

                                // Build a minimal sale snapshot from the wizard data so visit-prefill works
                                // in reverse (if someone later wants to "Marcar Visita Realizada" on this deal,
                                // the form will be pre-populated with what the asesor already entered).
                                const saleSnapshot = {
                                    property_type: 'departamento' as const,  // wizard is apt-centric (Ross-Heidecke)
                                    rooms: features.rooms ?? null,
                                    bedrooms: features.bedrooms ?? null,
                                    bathrooms: features.bathrooms ?? null,
                                    garages: features.garages ?? null,
                                    covered_m2: features.coveredArea ?? null,
                                    semi_covered_m2: features.semiCoveredArea ?? null,
                                    uncovered_m2: features.uncoveredArea ?? null,
                                    total_m2: features.totalArea ?? null,
                                    terrain_m2: null,
                                    age_years: features.age ?? null,
                                    is_refurbished: false,
                                    orientation: null,
                                    floor: features.floor ?? null,
                                    total_floors: features.totalFloors ?? null,
                                    disposition: features.disposition === 'FRONT' ? 'frente'
                                        : features.disposition === 'BACK' ? 'contrafrente'
                                        : features.disposition === 'LATERAL' ? 'lateral'
                                        : features.disposition === 'INTERNAL' ? 'interno'
                                        : null,
                                    quality: features.quality === 'ECONOMIC' ? 'economica'
                                        : features.quality === 'GOOD_ECONOMIC' ? 'buena_economica'
                                        : features.quality === 'GOOD' ? 'buena'
                                        : features.quality === 'VERY_GOOD' ? 'muy_buena'
                                        : features.quality === 'EXCELLENT' ? 'excelente'
                                        : null,
                                    // Conservation: map STATE_X → estado_X with whitelist guard so an
                                    // unexpected value never lands in the JSONB column as garbage.
                                    conservation: (() => {
                                        const valid = new Set(['estado_1','estado_1_5','estado_2','estado_2_5','estado_3','estado_3_5','estado_4','estado_4_5','estado_5'])
                                        if (!features.conservationState) return null
                                        const mapped = features.conservationState.toLowerCase().replace(/^state_/, 'estado_')
                                        return valid.has(mapped) ? mapped : null
                                    })(),
                                    construction_features: [],
                                    reason_for_sale: null,
                                    sale_timeframe: null,
                                    strong_points: [],
                                    extra_notes: null,
                                }

                                const res = await fetch('/api/deals', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        contact_name: subject.title || subject.location || 'Sin nombre',
                                        property_address: subject.location || subject.title || '',
                                        origin: origin || 'historico',
                                        property_type: 'departamento',  // wizard is apt-only for now
                                        neighborhood,
                                        // Belt-and-suspenders: PropertyWizard validates rooms > 0 before
                                        // emitting, but coerce explicitly in case features.rooms is ever ''.
                                        rooms: Number(features.rooms) || 1,
                                        covered_area: features.coveredArea ? Number(features.coveredArea) : null,
                                    }),
                                })
                                if (res.ok) {
                                    const { id: newDealId } = await res.json()
                                    // Save the wizard snapshot to the deal so visit-prefill works in reverse
                                    try {
                                        await fetch(`/api/deals/${newDealId}/visit-data`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ snapshot: { sale: saleSnapshot } }),
                                        })
                                    } catch (e) { console.error('Error saving visit snapshot:', e) }
                                    // Then advance to appraisal_sent and link
                                    await fetch(`/api/deals/${newDealId}/advance`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ stage: 'appraisal_sent', appraisal_id: appraisalId }),
                                    })
                                }
                            } catch (e) { console.error('Error auto-creating deal:', e) }
                        }
                    }
                })
                .catch((err) => {
                    console.error('Error al guardar tasación:', err)
                    setSaveStatus('error')
                })
        }
    }

    function handlePrint() {
        window.print()
    }

    // Check if all comparables have complete data
    const allComparablesComplete = comparables.every(c => {
        const f = c.features
        return c.price && f.coveredArea && f.age !== null && f.disposition && f.quality && f.conservationState
    })

    if (editMode && editLoading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (dealLoading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (editMode && editLoadError) {
        return (
            <div className="max-w-5xl mx-auto text-center py-20">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h2 className="text-xl font-semibold mb-2">{editLoadError}</h2>
                <p className="text-muted-foreground">La tasación que intentás editar no existe o no se pudo cargar.</p>
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto space-y-12 pb-20">
            {/* Header / Hero */}
            <div className="text-center space-y-4 py-8 animate-in fade-in slide-in-from-top-4 duration-700">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary">
                    {editMode ? 'Editar Tasación' : 'Nueva Tasación'}
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    {editMode
                        ? 'Modificá los datos del sujeto, comparables o el análisis de valor. Los cambios se guardan al presionar "Recalcular y Guardar".'
                        : 'Genera informes de valor precisos y profesionales utilizando el método de comparables de mercado.'}
                </p>
            </div>

            {/* Deal context banner */}
            {dealData && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3">
                    <Home className="h-5 w-5 text-blue-600 shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                            Creando tasación para {dealData.contacts?.full_name || 'contacto'}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                            {dealData.property_address}
                        </p>
                    </div>
                </div>
            )}

            {/* Prefill-from-visit banner: only when deal has a visit_data.sale snapshot */}
            {dealData && hasSaleVisitPrefill(dealData) && !subject && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <p>
                        Datos de la propiedad prellenados desde la visita realizada. Revisá y ajustá si es necesario antes de continuar con los comparables.
                    </p>
                </div>
            )}

            {/* Step 1: Subject Property - Manual Entry */}
            <section className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold shadow-sm transition-all duration-300 ${subject ? 'bg-green-500 text-white' : 'bg-primary/10 text-primary'
                        }`}>
                        {subject ? <CheckCircle2 className="h-5 w-5" /> : '1'}
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                            <Home className="h-6 w-6 text-primary" />
                            Propiedad a Tasar
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Ingresa los datos de la propiedad que deseas tasar
                        </p>
                    </div>
                </div>

                {!subject || isEditingSubject ? (
                    <div className="bg-card rounded-2xl border shadow-sm p-6 md:p-8 transition-all duration-300 hover:shadow-md">
                        <PropertyWizard
                            onComplete={(p) => { handleSubjectComplete(p); setIsEditingSubject(false) }}
                            initialData={
                                subject
                                    ? mapSubjectToFormData(subject)
                                    : dealData
                                        ? mapDealToWizardInitialData(dealData)
                                        : undefined
                            }
                        />
                        {isEditingSubject && (
                            <div className="mt-4 flex justify-end">
                                <Button variant="ghost" size="sm" onClick={() => setIsEditingSubject(false)}>
                                    Cancelar edición
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-card rounded-2xl border shadow-sm p-6 transition-all duration-300 animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-start justify-between">
                            <div className="flex gap-4">
                                {subject.images?.[0] && (
                                    <img
                                        src={subject.images[0]}
                                        alt="Property"
                                        className="w-20 h-20 rounded-lg object-cover"
                                    />
                                )}
                                <div>
                                    <h3 className="font-semibold text-lg">{subject.title || subject.location}</h3>
                                    <p className="text-sm text-muted-foreground">{subject.location}</p>
                                    <div className="flex gap-4 mt-2 text-sm">
                                        <span>{subject.features.coveredArea}m² cubiertos</span>
                                        <span>{subject.features.rooms} amb.</span>
                                        <span>{subject.features.age} años</span>
                                    </div>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsEditingSubject(true)}
                                className="text-muted-foreground hover:text-primary"
                            >
                                <Edit2 className="h-4 w-4 mr-1" />
                                Modificar
                            </Button>
                        </div>
                    </div>
                )}
            </section>

            {/* Step 2: Comparables */}
            {subject && (
                <section id="comparables-section" className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold shadow-sm transition-all duration-300 ${comparables.length >= 3 && allComparablesComplete ? 'bg-green-500 text-white' : 'bg-primary/10 text-primary'
                            }`}>
                            {comparables.length >= 3 && allComparablesComplete ? <CheckCircle2 className="h-5 w-5" /> : '2'}
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                                <Layers className="h-6 w-6 text-primary" />
                                Propiedades Comparables
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Agrega al menos 3 propiedades similares publicadas para maximizar la precisión
                            </p>
                        </div>
                    </div>

                    <div className="bg-card rounded-2xl border shadow-sm p-6 md:p-8">
                        {/* Add comparable form */}
                        <div className="mb-6">
                            <p className="text-sm text-muted-foreground mb-3">
                                Ingresa la URL de una propiedad comparable (ZonaProp, ArgenProp, MercadoLibre)
                            </p>
                            <PropertyForm onPropertyLoaded={handleComparableScraped} />
                        </div>

                        <Separator className="my-6" />

                        {/* Comparables list */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-medium">
                                    Comparables agregadas ({comparables.length}/3+)
                                </h3>
                                {comparables.length > 0 && !allComparablesComplete && (
                                    <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-full">
                                        Algunos comparables tienen datos incompletos
                                    </span>
                                )}
                            </div>

                            {comparables.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                    <p>Aún no has agregado propiedades comparables</p>
                                    <p className="text-sm">Usa el buscador arriba para agregar la primera</p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {comparables.map((comp, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border transition-all duration-200 hover:shadow-sm"
                                        >
                                            {comp.images?.[0] && (
                                                <img
                                                    src={comp.images[0]}
                                                    alt="Comparable"
                                                    className="w-16 h-16 rounded-lg object-cover"
                                                />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-sm line-clamp-1">{comp.title}</h4>
                                                <p className="text-xs text-muted-foreground line-clamp-1">{comp.location}</p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-sm font-semibold text-primary">
                                                        {comp.price ? `USD ${comp.price.toLocaleString()}` : 'Sin precio'}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {comp.features.coveredArea}m²
                                                    </span>
                                                    <ComparableMissingIndicator property={comp} />
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEditComparable(index)}
                                                    className="h-8 w-8"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveComparable(index)}
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* Step 3: Overpriced Properties (Optional - Manual Only) */}
            {subject && comparables.length > 0 && (
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full font-bold shadow-sm bg-red-100 text-red-600 border-2 border-red-300">
                            3
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                                <TrendingDown className="h-6 w-6 text-red-500" />
                                Propiedades Fuera de Precio
                                <span className="text-sm font-normal text-muted-foreground">(Opcional)</span>
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Agrega aqui propiedades publicadas a precios superiores al mercado. Solo las que tu agregues apareceran como fuera de precio en el PDF.
                            </p>
                        </div>
                    </div>

                    <div className="bg-card rounded-2xl border-2 border-red-200 dark:border-red-900 shadow-sm p-6 md:p-8">
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                Esta seccion es manual. Las propiedades que agregues aqui apareceran con semaforo rojo en el informe PDF como referencia de propiedades fuera de precio.
                            </p>
                        </div>
                        <div className="mb-6">
                            <p className="text-sm text-muted-foreground mb-3">
                                Ingresa la URL de una propiedad fuera de precio (ZonaProp, ArgenProp, MercadoLibre)
                            </p>
                            <PropertyForm onPropertyLoaded={(prop) => setOverpriced([...overpriced, prop])} />
                        </div>

                        {overpriced.length > 0 && (
                            <>
                                <Separator className="my-6" />
                                <div className="space-y-4">
                                    <h3 className="font-medium text-red-600">
                                        Fuera de precio ({overpriced.length})
                                    </h3>
                                    <div className="grid gap-3">
                                        {overpriced.map((prop, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center gap-4 p-4 bg-red-50/50 dark:bg-red-950/10 rounded-xl border border-red-200/50 transition-all duration-200"
                                            >
                                                {prop.images?.[0] && (
                                                    <img
                                                        src={prop.images[0]}
                                                        alt="Fuera de precio"
                                                        className="w-16 h-16 rounded-lg object-cover"
                                                    />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium text-sm line-clamp-1">{prop.title || prop.location}</h4>
                                                    <p className="text-xs text-muted-foreground line-clamp-1">{prop.location}</p>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-sm font-semibold text-red-600">
                                                            {prop.price ? `USD ${prop.price.toLocaleString()}` : 'Sin precio'}
                                                        </span>
                                                        {prop.features.coveredArea && (
                                                            <span className="text-xs text-muted-foreground">
                                                                {prop.features.coveredArea}m² cub.
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setOverpriced(overpriced.filter((_, i) => i !== index))}
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </section>
            )}

            {/* Step 4: Purchase Properties (Optional) */}
            {subject && comparables.length > 0 && (
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold shadow-sm ${purchaseProperties.length > 0 ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600 border-2 border-blue-300'}`}>
                            {purchaseProperties.length > 0 ? <CheckCircle2 className="h-5 w-5" /> : '4'}
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                                <ShoppingBag className="h-6 w-6 text-blue-500" />
                                Propiedades para la Compra
                                <span className="text-sm font-normal text-muted-foreground">(Opcional)</span>
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                Agrega propiedades que el vendedor quiere comprar. Se incluiran en la simulacion de compra y venta del informe.
                            </p>
                        </div>
                    </div>

                    <div className="bg-card rounded-2xl border-2 border-blue-200 dark:border-blue-900 shadow-sm p-6 md:p-8">
                        <div className="mb-6">
                            <p className="text-sm text-muted-foreground mb-3">
                                Ingresa la URL de una propiedad para compra (ZonaProp, ArgenProp, MercadoLibre)
                            </p>
                            <PropertyForm onPropertyLoaded={(prop) => setPurchaseProperties([...purchaseProperties, prop])} />
                        </div>

                        {purchaseProperties.length > 0 && (
                            <>
                                <Separator className="my-6" />
                                <div className="space-y-4">
                                    <h3 className="font-medium text-blue-600">
                                        Propiedades para compra ({purchaseProperties.length})
                                    </h3>
                                    <div className="grid gap-3">
                                        {purchaseProperties.map((prop, index) => {
                                            const homSurface = (prop.features.coveredArea || 0) + ((prop.features.uncoveredArea || 0) * 0.5)
                                            const pricePerM2 = homSurface > 0 ? (prop.price || 0) / homSurface : 0
                                            return (
                                                <div
                                                    key={index}
                                                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 ${selectedPurchaseIndex === index
                                                        ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-400 ring-2 ring-blue-200'
                                                        : 'bg-muted/30 border-border hover:shadow-sm'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="selectedPurchase"
                                                        checked={selectedPurchaseIndex === index}
                                                        onChange={() => setSelectedPurchaseIndex(index)}
                                                        className="h-4 w-4 text-blue-600"
                                                    />
                                                    {prop.images?.[0] && (
                                                        <img
                                                            src={prop.images[0]}
                                                            alt="Compra"
                                                            className="w-16 h-16 rounded-lg object-cover"
                                                        />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-medium text-sm line-clamp-1">{prop.title || prop.location}</h4>
                                                        <p className="text-xs text-muted-foreground line-clamp-1">{prop.location}</p>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            <span className="text-sm font-semibold text-blue-600">
                                                                {prop.price ? `USD ${prop.price.toLocaleString()}` : 'Sin precio'}
                                                            </span>
                                                            {prop.features.coveredArea && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {prop.features.coveredArea}m²
                                                                </span>
                                                            )}
                                                            {pricePerM2 > 0 && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {Math.round(pricePerM2).toLocaleString()} USD/m²
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => {
                                                            setPurchaseProperties(purchaseProperties.filter((_, i) => i !== index))
                                                            if (selectedPurchaseIndex === index) setSelectedPurchaseIndex(null)
                                                            else if (selectedPurchaseIndex !== null && selectedPurchaseIndex > index) setSelectedPurchaseIndex(selectedPurchaseIndex - 1)
                                                        }}
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    {selectedPurchaseIndex === null && (
                                        <p className="text-xs text-amber-600">Selecciona una propiedad para incluirla en la simulacion de compra y venta</p>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Purchase Expense Rates */}
                        {purchaseProperties.length > 0 && selectedPurchaseIndex !== null && (
                            <details className="mt-6">
                                <summary className="cursor-pointer font-semibold text-sm flex items-center gap-2">
                                    <Calculator className="h-4 w-4 text-blue-500" />
                                    Porcentajes de Gastos de Compra
                                    <span className="text-xs font-normal text-muted-foreground ml-1">(click para ajustar)</span>
                                </summary>
                                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Descuento compra %</label>
                                        <input type="number" step="0.1" min="0" max="50"
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                            value={purchaseExpenseRates.purchaseDiscountPercent}
                                            onChange={e => setPurchaseExpenseRates(r => ({ ...r, purchaseDiscountPercent: Number(e.target.value) }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Desc. escritura %</label>
                                        <input type="number" step="0.1" min="0" max="50"
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                            value={purchaseExpenseRates.deedDiscountPercent}
                                            onChange={e => setPurchaseExpenseRates(r => ({ ...r, deedDiscountPercent: Number(e.target.value) }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Sellos %</label>
                                        <input type="number" step="0.01" min="0" max="10"
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                            value={purchaseExpenseRates.stampsPercent}
                                            onChange={e => setPurchaseExpenseRates(r => ({ ...r, stampsPercent: Number(e.target.value) }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Hon. Escribano %</label>
                                        <input type="number" step="0.01" min="0" max="10"
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                            value={purchaseExpenseRates.notaryFeesPercent}
                                            onChange={e => setPurchaseExpenseRates(r => ({ ...r, notaryFeesPercent: Number(e.target.value) }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Gastos escritura %</label>
                                        <input type="number" step="0.01" min="0" max="10"
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                            value={purchaseExpenseRates.deedExpensesPercent}
                                            onChange={e => setPurchaseExpenseRates(r => ({ ...r, deedExpensesPercent: Number(e.target.value) }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-muted-foreground">Hon. Inmobiliaria %</label>
                                        <input type="number" step="0.01" min="0" max="10"
                                            className="w-full rounded-md border px-3 py-2 text-sm"
                                            value={purchaseExpenseRates.buyerCommissionPercent}
                                            onChange={e => setPurchaseExpenseRates(r => ({ ...r, buyerCommissionPercent: Number(e.target.value) }))}
                                        />
                                    </div>
                                </div>
                            </details>
                        )}

                        {/* Escenarios de compra (Conservador / Medio / Agresivo) */}
                        {purchaseProperties.length > 0 && purchaseScenarios.length > 0 && valuationResult && (
                            <div className="mt-6">
                                <PurchaseScenariosEditor
                                    scenarios={purchaseScenarios}
                                    results={valuationResult.purchaseScenarios || []}
                                    selectedIds={selectedScenarioIds}
                                    currency={valuationResult.currency}
                                    moneyFromSale={valuationResult.moneyInHand}
                                    onScenariosChange={setPurchaseScenarios}
                                    onSelectedIdsChange={setSelectedScenarioIds}
                                />
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Expense Rates (collapsible) */}
            {subject && comparables.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <details className="bg-card rounded-2xl border shadow-sm">
                        <summary className="p-5 cursor-pointer font-semibold flex items-center gap-2 text-sm">
                            <Calculator className="h-4 w-4 text-primary" />
                            Porcentajes de Gastos de Venta
                            <span className="text-xs font-normal text-muted-foreground ml-1">(click para ajustar)</span>
                        </summary>
                        <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Descuento venta %</label>
                                <input type="number" step="0.1" min="0" max="50"
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={expenseRates.saleDiscountPercent}
                                    onChange={e => setExpenseRates(r => ({ ...r, saleDiscountPercent: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Desc. escritura %</label>
                                <input type="number" step="0.1" min="0" max="50"
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={expenseRates.deedDiscountPercent}
                                    onChange={e => setExpenseRates(r => ({ ...r, deedDiscountPercent: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Sellos %</label>
                                <input type="number" step="0.01" min="0" max="10"
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={expenseRates.stampsPercent}
                                    onChange={e => setExpenseRates(r => ({ ...r, stampsPercent: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Gastos escritura %</label>
                                <input type="number" step="0.01" min="0" max="10"
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={expenseRates.deedExpensesPercent}
                                    onChange={e => setExpenseRates(r => ({ ...r, deedExpensesPercent: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Honorarios %</label>
                                <input type="number" step="0.01" min="0" max="10"
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={expenseRates.agencyFeesPercent}
                                    onChange={e => setExpenseRates(r => ({ ...r, agencyFeesPercent: Number(e.target.value) }))}
                                />
                            </div>
                        </div>
                    </details>
                </section>
            )}

            {/* Step 4: Calculation Button */}
            {subject && comparables.length > 0 && (
                <section className="flex flex-col items-center py-8 animate-in fade-in zoom-in-95 duration-500">
                    {!allComparablesComplete && (
                        <p className="text-sm text-amber-600 mb-4 flex items-center gap-2">
                            <FileCheck className="h-4 w-4" />
                            Completa los datos de todos los comparables para calcular
                        </p>
                    )}
                    <Button
                        size="lg"
                        className="h-14 px-8 rounded-full text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 bg-primary text-primary-foreground gap-2"
                        onClick={handleCalculate}
                        disabled={!allComparablesComplete || saveStatus === 'saving'}
                    >
                        <Calculator className="h-5 w-5" />
                        Calcular Valor de Mercado
                        <ArrowRight className="h-5 w-5 opacity-50" />
                    </Button>
                </section>
            )}

            {/* Results Section - Full HTML Report */}
            {valuationResult && subject && (
                <section id="valuation-report" className="space-y-8 animate-in fade-in slide-in-from-bottom-12 duration-1000">
                    <div className="flex items-center justify-center gap-2 mb-8 text-muted-foreground">
                        <div className="h-px bg-border flex-1 max-w-[100px]" />
                        <span className="text-sm font-medium uppercase tracking-widest">Resultados del Informe</span>
                        <div className="h-px bg-border flex-1 max-w-[100px]" />
                    </div>

                    <ValuationReport
                        subject={{
                            price: subject.price,
                            currency: subject.currency,
                            title: subject.title,
                            location: subject.location,
                            features: subject.features as any
                        }}
                        result={valuationResult}
                        editable
                        onComparableFeaturesChange={handleComparableFeaturesChange}
                        onSubjectFeaturesChange={handleSubjectFeaturesChange}
                        expenseRates={valuationResult.expenseRates}
                        onExpenseRatesChange={(next) => setExpenseRates(prev => ({ ...prev, ...next }))}
                    />

                    {/* Save status indicator */}
                    {saveStatus !== 'idle' && (
                        <div className="flex items-center justify-center gap-2 text-sm print:hidden">
                            {saveStatus === 'saving' && (
                                <><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Guardando...</span></>
                            )}
                            {saveStatus === 'saved' && (
                                <><CheckCheck className="h-4 w-4 text-green-600" /><span className="text-green-600">Guardado en historial</span></>
                            )}
                            {saveStatus === 'error' && (
                                <><AlertCircle className="h-4 w-4 text-red-500" /><span className="text-red-500">Error al guardar</span>
                                    <Button variant="ghost" size="sm" className="text-red-500 h-auto p-0 underline" onClick={() => {
                                        if (!subject || !valuationResult) return
                                        setSaveStatus('saving')
                                        const payload = { subject, comparables, overpriced, purchaseProperties, valuationResult, origin: origin || undefined, assignedTo: assignedTo || undefined }
                                        // Use the same id-tracking logic: if we already saved once, UPDATE not INSERT.
                                        const existingId = editId || savedAppraisalId
                                        const promise = existingId
                                            ? updateAppraisal(existingId, payload)
                                            : saveAppraisal(payload).then(newId => {
                                                setSavedAppraisalId(newId)
                                                savedAppraisalIdRef.current = newId
                                                // Mirror the URL update so a refresh after retry stays in edit mode.
                                                const params = new URLSearchParams(searchParams.toString())
                                                params.set('editId', newId)
                                                router.replace(`/appraisal/new?${params.toString()}`, { scroll: false })
                                                return newId
                                            })
                                        promise
                                            .then(() => setSaveStatus('saved'))
                                            .catch(() => setSaveStatus('error'))
                                    }}>Reintentar</Button>
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex justify-center gap-4 print:hidden pt-4">
                        <Button
                            size="lg"
                            variant="outline"
                            className="h-12 border-primary/20 hover:bg-primary/5 text-primary"
                            onClick={handlePrint}
                        >
                            <Printer className="mr-2 h-4 w-4" />
                            Imprimir
                        </Button>
                        <Button
                            size="lg"
                            className="h-12 gap-2"
                            onClick={() => setShowPDFPreview(true)}
                        >
                            <FileText className="h-4 w-4" />
                            Vista Previa PDF
                        </Button>
                    </div>
                </section>
            )}

            {/* Comparable Editor Modal */}
            {(pendingComparable || editingComparable) && (
                <ComparableEditor
                    property={pendingComparable || editingComparable!.property}
                    onSave={handleComparableSaved}
                    onCancel={() => {
                        setPendingComparable(null)
                        setEditingComparable(null)
                    }}
                />
            )}

            {/* PDF Preview Modal */}
            {showPDFPreview && valuationResult && subject && (
                <PDFPreviewModal
                    open={showPDFPreview}
                    onOpenChange={setShowPDFPreview}
                    subject={{
                        price: subject.price,
                        currency: subject.currency,
                        title: subject.title,
                        location: subject.location,
                        images: subject.images,
                        description: subject.description,
                        features: subject.features as any
                    }}
                    comparables={comparables.map(c => ({
                        price: c.price,
                        currency: c.currency,
                        title: c.title,
                        location: c.location,
                        images: c.images,
                        description: c.description,
                        url: c.url,
                        features: c.features as any
                    }))}
                    overpriced={overpriced.map(c => ({
                        price: c.price,
                        currency: c.currency,
                        title: c.title,
                        location: c.location,
                        images: c.images,
                        url: c.url,
                        features: c.features as any
                    }))}
                    valuationResult={valuationResult}
                    purchaseProperties={purchaseProperties.map(c => ({
                        price: c.price,
                        currency: c.currency,
                        title: c.title,
                        location: c.location,
                        images: c.images,
                        description: c.description,
                        url: c.url,
                        features: c.features as any
                    }))}
                    purchaseResult={purchaseResult || undefined}
                    reportEdits={reportEdits}
                    onReportEditsChange={setReportEdits}
                    appraisalDate={new Date().toISOString()}
                />
            )}
        </div>
    )
}

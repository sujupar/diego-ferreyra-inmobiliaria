'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { PropertyWizard } from '@/components/appraisal/PropertyWizard'
import { PropertyForm } from '@/components/appraisal/PropertyForm'
import { ComparableEditor, ComparableMissingIndicator } from '@/components/appraisal/ComparableEditor'
import { ValuationReport } from '@/components/appraisal/ValuationReport'
import { ScrapedProperty } from '@/lib/scraper/types'
import { calculateValuation, ValuationResult, ValuationProperty, ExpenseRates } from '@/lib/valuation/calculator'
import { saveAppraisal } from '@/lib/supabase/appraisals'
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
    TrendingDown
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'

const PDFPreviewModal = dynamic(
    () => import('@/components/appraisal/PDFPreviewModal').then(m => m.PDFPreviewModal),
    { ssr: false }
)

export default function NewAppraisalPage() {
    const [subject, setSubject] = useState<ScrapedProperty | null>(null)
    const [comparables, setComparables] = useState<ScrapedProperty[]>([])
    const [overpriced, setOverpriced] = useState<ScrapedProperty[]>([])
    const [valuationResult, setValuationResult] = useState<ValuationResult | null>(null)

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

    // Market image data for PDF
    const [marketImageLabels, setMarketImageLabels] = useState<Record<string, { label: string; description: string }>>({})
    const [marketImageUrls, setMarketImageUrls] = useState<Record<string, string>>({})

    // Fetch market image settings on mount
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

    // Auto-save state
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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

        const result = calculateValuation({
            subject: subjectValuation,
            comparables: comparablesValuation,
            expenseRates,
        })

        setValuationResult(result)

        // Scroll to results
        setTimeout(() => {
            document.getElementById('valuation-report')?.scrollIntoView({ behavior: 'smooth' })
        }, 100)

        // Auto-save to Supabase
        if (result) {
            setSaveStatus('saving')
            saveAppraisal({ subject, comparables, overpriced, valuationResult: result })
                .then(() => setSaveStatus('saved'))
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

    return (
        <div className="max-w-5xl mx-auto space-y-12 pb-20">
            {/* Header / Hero */}
            <div className="text-center space-y-4 py-8 animate-in fade-in slide-in-from-top-4 duration-700">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary">
                    Nueva Tasación
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    Genera informes de valor precisos y profesionales utilizando el método de comparables de mercado.
                </p>
            </div>

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

                {!subject ? (
                    <div className="bg-card rounded-2xl border shadow-sm p-6 md:p-8 transition-all duration-300 hover:shadow-md">
                        <PropertyWizard onComplete={handleSubjectComplete} />
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
                                onClick={() => setSubject(null)}
                                className="text-muted-foreground hover:text-destructive"
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
                        disabled={!allComparablesComplete}
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
                                        saveAppraisal({ subject, comparables, overpriced, valuationResult })
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
                    marketImageLabels={marketImageLabels}
                    marketImageUrls={marketImageUrls}
                />
            )}
        </div>
    )
}

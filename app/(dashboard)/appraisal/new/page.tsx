'use client'

import { useState } from 'react'
import { PropertyManualEdit } from '@/components/appraisal/PropertyManualEdit'
import { PropertyForm } from '@/components/appraisal/PropertyForm'
import { ComparablesList } from '@/components/appraisal/ComparablesList'
import { ValuationReport } from '@/components/appraisal/ValuationReport'
import { PDFDownloadButton } from '@/components/appraisal/PDFDownloadButton'
import { ScrapedProperty } from '@/lib/scraper/types'
import { calculateValuation, ValuationResult, ValuationProperty } from '@/lib/valuation/calculator'
import { Button } from '@/components/ui/button'
import { Calculator, FileCheck, Printer, ArrowRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

export default function NewAppraisalPage() {
    const [subject, setSubject] = useState<ScrapedProperty | null>(null)
    const [comparables, setComparables] = useState<ScrapedProperty[]>([])
    const [valuationResult, setValuationResult] = useState<ValuationResult | null>(null)

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
            comparables: comparablesValuation
        })

        setValuationResult(result)

        // Scroll to results
        setTimeout(() => {
            document.getElementById('valuation-report')?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
    }

    function handlePrint() {
        window.print()
    }

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

            {/* Step 1: Subject Property */}
            <section className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold shadow-sm">
                        1
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight">Propiedad Objetivo</h2>
                        <p className="text-muted-foreground text-sm">Ingresa la URL de la propiedad que deseas tasar.</p>
                    </div>
                </div>

                <div className="bg-card rounded-2xl border shadow-sm p-6 md:p-8 transition-all duration-300 hover:shadow-md">
                    <div className="mb-8">
                        <PropertyForm onPropertyLoaded={setSubject} />
                    </div>

                    {subject && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                            <Separator className="my-8" />
                            <PropertyManualEdit property={subject} onChange={setSubject} />
                        </div>
                    )}
                </div>
            </section>

            {/* Step 2: Comparables */}
            {subject && (
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold shadow-sm">
                            2
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight">Comparables de Mercado</h2>
                            <p className="text-muted-foreground text-sm">Agrega al menos 3 propiedades similares para maximizar la precisión.</p>
                        </div>
                    </div>

                    <div className="bg-card rounded-2xl border shadow-sm p-6 md:p-8">
                        <ComparablesList
                            comparables={comparables}
                            onAddComparable={(p) => setComparables([...comparables, p])}
                            onRemoveComparable={(i) => setComparables(comparables.filter((_, idx) => idx !== i))}
                        />
                    </div>
                </section>
            )}

            {/* Step 3: Calculation Button */}
            {subject && comparables.length > 0 && (
                <section className="flex justify-center py-8 animate-in fade-in zoom-in-95 duration-500">
                    <Button
                        size="lg"
                        className="h-14 px-8 rounded-full text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 bg-primary text-primary-foreground gap-2"
                        onClick={handleCalculate}
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

                    <div className="flex justify-center gap-4 print:hidden pt-8">
                        <Button
                            size="lg"
                            variant="outline"
                            className="h-12 border-primary/20 hover:bg-primary/5 text-primary"
                            onClick={handlePrint}
                        >
                            <Printer className="mr-2 h-4 w-4" />
                            Imprimir
                        </Button>
                        <PDFDownloadButton
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
                            valuationResult={valuationResult}
                        />

                    </div>
                </section>
            )}
        </div>
    )
}

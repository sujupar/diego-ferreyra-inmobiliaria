'use client'

import { ValuationResult, ValuationProperty } from '@/lib/valuation/calculator'
import {
    DISPOSITION_LABELS,
    QUALITY_LABELS,
    CONSERVATION_LABELS,
    DispositionType,
    QualityType,
    ConservationStateType
} from '@/lib/valuation/rules'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface ValuationReportProps {
    subject: ValuationProperty
    result: ValuationResult
}

function formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency === 'ARS' ? 'ARS' : 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)
}

function formatNumber(value: number, decimals: number = 2): string {
    return value.toFixed(decimals)
}

function formatPercent(value: number): string {
    return `${((value - 1) * 100).toFixed(1)}%`
}

export function ValuationReport({ subject, result }: ValuationReportProps) {
    const today = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    return (
        <div className="bg-card rounded-xl shadow-sm border p-8 print:shadow-none print:border-none" id="valuation-report">
            {/* Header */}
            <div className="border-b border-primary/10 pb-6 mb-8">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Informe de Tasación</h1>
                        <p className="text-muted-foreground mt-1">Método de Comparables de Mercado</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">Fecha de emisión</p>
                        <p className="font-semibold text-foreground">{today}</p>
                    </div>
                </div>
            </div>

            {/* Executive Summary */}
            <div className="bg-primary/5 rounded-lg p-6 mb-8 border border-primary/10">
                <h2 className="text-xl font-semibold text-primary mb-4">Resumen Ejecutivo</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <p className="text-sm text-muted-foreground">Propiedad Tasada</p>
                        <p className="font-semibold text-foreground text-lg">{subject.title || subject.location || 'Sin título'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Superficie Homogeneizada</p>
                        <p className="font-semibold text-foreground text-lg">{formatNumber(result.subjectSurface, 2)} m²</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Valor por m²</p>
                        <p className="font-semibold text-foreground text-lg">{formatCurrency(result.averagePriceM2, result.currency)}/m²</p>
                    </div>
                </div>
                <div className="mt-6 pt-6 border-t border-primary/10">
                    <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-foreground/80">VALOR DE TASACIÓN</span>
                        <span className="text-4xl font-bold text-primary">
                            {formatCurrency(result.finalValue, result.currency)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Subject Property Details */}
            <div className="mb-10">
                <h2 className="text-xl font-semibold text-foreground mb-4">Datos de la Propiedad</h2>
                <Card className="shadow-none bg-secondary/20">
                    <CardContent className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Ubicación</p>
                                <p className="font-medium text-foreground">{subject.location || 'No especificada'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Sup. Cubierta</p>
                                <p className="font-medium text-foreground">{subject.features.coveredArea || '-'} m²</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Sup. Total</p>
                                <p className="font-medium text-foreground">{subject.features.totalArea || '-'} m²</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Antigüedad</p>
                                <p className="font-medium text-foreground">{subject.features.age || 0} años</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Piso</p>
                                <p className="font-medium text-foreground">{subject.features.floor === 0 ? 'PB' : subject.features.floor || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Disposición</p>
                                <p className="font-medium text-foreground">
                                    {subject.features.disposition
                                        ? DISPOSITION_LABELS[subject.features.disposition as DispositionType]
                                        : 'No especificada'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Calidad</p>
                                <p className="font-medium text-foreground">
                                    {subject.features.quality
                                        ? QUALITY_LABELS[subject.features.quality as QualityType]
                                        : 'No especificada'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Estado</p>
                                <p className="font-medium text-foreground">
                                    {subject.features.conservationState
                                        ? CONSERVATION_LABELS[subject.features.conservationState as ConservationStateType]
                                        : 'No especificado'}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Comparables Analysis Table */}
            <div className="mb-10">
                <h2 className="text-xl font-semibold text-foreground mb-4">Análisis de Comparables</h2>
                <div className="overflow-hidden rounded-lg border border-border">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border">
                            <thead className="bg-secondary/40">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Comparable</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Precio Original</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sup. Hom.</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">$/m² Original</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aj. Piso</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aj. Disp.</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aj. Calidad</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aj. Edad</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-primary uppercase tracking-wider">$/m² Ajustado</th>
                                </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-border">
                                {result.comparableAnalysis.map((analysis, index) => (
                                    <tr key={index} className="hover:bg-muted/50 transition-colors">
                                        <td className="px-4 py-3 text-sm">
                                            <p className="font-medium text-foreground">Comp. {index + 1}</p>
                                            <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={analysis.property.title}>
                                                {analysis.property.location || analysis.property.title || 'Sin ubicación'}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-foreground/80">
                                            {formatCurrency(analysis.property.price || 0, result.currency)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                                            {formatNumber(analysis.homogenizedSurface)} m²
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                                            {formatCurrency(analysis.originalPriceM2, result.currency)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            <span className={analysis.floorFactor >= 1 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                                                {formatPercent(analysis.floorFactor)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            <span className={analysis.dispositionFactor >= 1 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                                                {formatPercent(analysis.dispositionFactor)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            <span className={analysis.qualityFactor >= 1 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                                                {formatPercent(analysis.qualityFactor)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            <span className={analysis.ageFactor >= 1 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                                                {formatPercent(analysis.ageFactor)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-bold text-primary">
                                            {formatCurrency(analysis.adjustedPriceM2, result.currency)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-secondary/40 font-medium">
                                <tr>
                                    <td colSpan={8} className="px-4 py-3 text-sm text-right border-t border-border">
                                        Promedio $/m² Ajustado:
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-bold text-primary border-t border-border">
                                        {formatCurrency(result.averagePriceM2, result.currency)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>

            {/* Methodology */}
            <div className="mb-10">
                <h2 className="text-xl font-semibold text-foreground mb-4">Metodología Aplicada</h2>
                <div className="bg-secondary/20 rounded-lg p-6 text-sm text-muted-foreground leading-relaxed">
                    <p className="mb-4">
                        La tasación se realizó utilizando el <strong>Método de Comparables de Mercado</strong>,
                        que consiste en analizar propiedades similares recientemente ofertadas o vendidas en la zona,
                        y ajustar sus precios según las diferencias con la propiedad tasada.
                    </p>
                    <h4 className="font-semibold text-foreground mt-4 mb-2">Coeficientes de Ajuste Aplicados:</h4>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Homogeneización de Superficie:</strong> Cubierta 100%, Semi-cubierta/Balcón/Descubierta 50%</li>
                        <li><strong>Piso:</strong> PB 0.90, 1° 0.90, 2° 0.95, 3°-4° 1.00, 5°-6° 1.05, 7°-8° 1.10, +8° 1.15</li>
                        <li><strong>Disposición:</strong> Frente 1.00, Contrafrente 0.95, Lateral 0.93, Interno 0.90</li>
                        <li><strong>Calidad Constructiva:</strong> Económica 0.90 a Excelente 1.275</li>
                        <li><strong>Depreciación:</strong> Método Ross-Heidecke según edad y estado de conservación</li>
                    </ul>
                </div>
            </div>

            {/* Final Value */}
            <div className="bg-primary text-primary-foreground rounded-2xl p-10 text-center shadow-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                <p className="text-lg opacity-90 mb-2 font-medium tracking-wide">Valor de Tasación Final</p>
                <p className="text-5xl font-extrabold tracking-tight mb-4">{formatCurrency(result.finalValue, result.currency)}</p>
                <div className="inline-flex items-center gap-2 text-sm opacity-75 bg-black/20 px-3 py-1 rounded-full">
                    <span>{result.comparableAnalysis.length} propiedades comparadas</span>
                    <span>•</span>
                    <span>Sup. Homogeneizada: {formatNumber(result.subjectSurface)} m²</span>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground uppercase tracking-widest">
                <p>Diego Ferreyra Gestión Inmobiliaria</p>
            </div>
        </div>
    )
}

'use client'

import { memo, useState } from 'react'
import { ValuationResult, ValuationProperty, ExpenseRates } from '@/lib/valuation/calculator'
import { formatCurrency } from '@/lib/valuation/utils'
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
import { Button } from '@/components/ui/button'
import { Edit2, Check } from 'lucide-react'
import type { PropertyFeatures } from '@/lib/scraper/types'
import { SubjectFeaturesEditor } from './SubjectFeaturesEditor'

interface ValuationReportProps {
    subject: ValuationProperty
    result: ValuationResult
    editable?: boolean
    onComparableFeaturesChange?: (index: number, features: Record<string, unknown>) => void
    onSubjectFeaturesChange?: (features: PropertyFeatures) => void
    expenseRates?: Required<ExpenseRates>
    onExpenseRatesChange?: (next: Partial<ExpenseRates>) => void
}

const DISPOSITION_OPTIONS: DispositionType[] = ['FRONT', 'BACK', 'LATERAL', 'INTERNAL']
const QUALITY_OPTIONS: QualityType[] = ['ECONOMIC', 'GOOD_ECONOMIC', 'GOOD', 'VERY_GOOD', 'EXCELLENT']
const CONSERVATION_OPTIONS: ConservationStateType[] = [
    'STATE_1', 'STATE_1_5', 'STATE_2', 'STATE_2_5', 'STATE_3', 'STATE_3_5', 'STATE_4', 'STATE_4_5', 'STATE_5'
]


function formatNumber(value: number | undefined | null, decimals: number = 2): string {
    if (value == null || isNaN(value)) return '—'
    return value.toFixed(decimals)
}


function ValuationReportInner({
    subject,
    result,
    editable = false,
    onComparableFeaturesChange,
    onSubjectFeaturesChange,
    expenseRates,
    onExpenseRatesChange,
}: ValuationReportProps) {
    // Effective rates with fallback to result.expenseRates or hardcoded defaults
    const effectiveRates: Required<ExpenseRates> = expenseRates ?? result.expenseRates ?? {
        saleDiscountPercent: 5,
        deedDiscountPercent: 30,
        stampsPercent: 1.35,
        deedExpensesPercent: 1.5,
        agencyFeesPercent: 3,
    }
    const ratesEditable = editable && Boolean(onExpenseRatesChange)
    const [isEditing, setIsEditing] = useState(false)

    const today = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    const updateCompFeature = (index: number, key: string, value: unknown) => {
        if (!onComparableFeaturesChange) return
        // Defensa: tasaciones cargadas con rehidratación incompleta pueden tener
        // analysis.property como objeto vacío. Usar optional chaining en ambos niveles.
        const current = result.comparableAnalysis[index]?.property?.features || {}
        onComparableFeaturesChange(index, { ...current, [key]: value })
    }

    const updateSubjectFeature = (key: string, value: unknown) => {
        if (!onSubjectFeaturesChange) return
        const current = subject.features || ({} as PropertyFeatures)
        onSubjectFeaturesChange({ ...current, [key]: value } as PropertyFeatures)
    }

    const parseNum = (v: string): number | null => {
        if (v === '') return null
        const n = parseFloat(v)
        return isNaN(n) ? null : n
    }

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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                        <p className="font-semibold text-foreground text-lg">{formatCurrency(result.subjectPriceM2, result.currency)}/m²</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Promedio $/m² Ajustado</p>
                        <p className="font-semibold text-foreground text-lg">{formatCurrency(result.averagePriceM2, result.currency)}</p>
                    </div>
                </div>
                <div className="mt-6 pt-6 border-t border-primary/10 grid grid-cols-2 gap-6">
                    <div className="flex justify-between items-center">
                        <span className="text-base font-medium text-foreground/70">PRECIO DE PUBLICACIÓN</span>
                        <span className="text-3xl font-bold text-primary">
                            {formatCurrency(result.publicationPrice, result.currency)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-base font-medium text-foreground/70">ZONA DE NO VENTA</span>
                        <span className="text-3xl font-bold text-red-500">
                            {formatCurrency(result.noSaleZonePrice, result.currency)}
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
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Sup. Descubierta</p>
                                <p className="font-medium text-foreground">{(subject.features as any).uncoveredArea || '-'} m²</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Sup. Homogeneizada</p>
                                <p className="font-medium text-primary">{formatNumber(result.subjectSurface, 2)} m²</p>
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
                {editable && onSubjectFeaturesChange && (
                    <div className="mt-4">
                        <SubjectFeaturesEditor
                            value={{
                                coveredArea: subject.features.coveredArea ?? null,
                                uncoveredArea: subject.features.uncoveredArea ?? null,
                                rooms: subject.features.rooms ?? null,
                                bedrooms: subject.features.bedrooms ?? null,
                                bathrooms: subject.features.bathrooms ?? null,
                                age: subject.features.age ?? null,
                                floor: subject.features.floor ?? null,
                                totalFloors: subject.features.totalFloors ?? null,
                                garages: subject.features.garages ?? null,
                            }}
                            onChange={next => onSubjectFeaturesChange?.({ ...subject.features, ...next } as PropertyFeatures)}
                        />
                    </div>
                )}
            </div>

            {/* Comparables Analysis Table */}
            <div className="mb-10">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-foreground">Mapa de Valor — Análisis de Comparables</h2>
                    {editable && (
                        <Button
                            variant={isEditing ? 'default' : 'outline'}
                            size="sm"
                            className="gap-2"
                            onClick={() => setIsEditing(!isEditing)}
                        >
                            {isEditing ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    Cerrar Edición
                                </>
                            ) : (
                                <>
                                    <Edit2 className="h-4 w-4" />
                                    Editar Análisis
                                </>
                            )}
                        </Button>
                    )}
                </div>
                {isEditing && (
                    <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
                        <strong>Modo edición activado.</strong> Al cambiar cualquier valor (piso, disposición, calidad, edad/estado o ubicación),
                        todo el análisis se recalcula automáticamente: coeficientes, $/m² ajustado, promedio y precio de publicación.
                    </div>
                )}
                <div className="overflow-hidden rounded-lg border border-border">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border">
                            <thead className="bg-secondary/40">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"></th>
                                    <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
                                    <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">M² Hom.</th>
                                    <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">$/m²</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ubic.</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Piso</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Disp.</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edad/Est.</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calidad</th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                                    <th className="px-3 py-3 text-right text-xs font-semibold text-primary uppercase tracking-wider">$/m² Aj.</th>
                                </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-border">
                                {/* Subject row */}
                                <tr className="bg-primary/5 border-b-2 border-primary/20">
                                    <td className="px-3 py-3 text-sm">
                                        <p className="font-semibold text-primary">Sujeto</p>
                                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                            {subject.location || subject.title || 'Propiedad tasada'}
                                        </p>
                                    </td>
                                    <td className="px-3 py-3 text-sm text-right font-semibold text-primary">
                                        {formatCurrency(result.publicationPrice, result.currency)}
                                    </td>
                                    <td className="px-3 py-3 text-sm text-right font-medium text-primary">
                                        {formatNumber(result.subjectSurface)} m²
                                    </td>
                                    <td className="px-3 py-3 text-sm text-right font-medium text-primary">
                                        {formatCurrency(result.subjectPriceM2, result.currency)}
                                    </td>
                                    {/* Ubic. — subject always fixed at 1.00 */}
                                    <td className="px-3 py-3 text-sm text-center font-medium text-primary">{formatNumber(result.subjectLocationCoef, 2)}</td>
                                    {/* Piso — editable (number) */}
                                    <td className="px-3 py-3 text-sm text-center font-medium text-primary">
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-16 px-2 py-1 text-center text-xs rounded border border-primary/30 bg-background"
                                                value={subject.features.floor ?? ''}
                                                onChange={(e) => updateSubjectFeature('floor', parseNum(e.target.value))}
                                            />
                                        ) : (
                                            formatNumber(result.subjectFloorCoef, 2)
                                        )}
                                    </td>
                                    {/* Disp. — editable (select) */}
                                    <td className="px-3 py-3 text-sm text-center font-medium text-primary">
                                        {isEditing ? (
                                            <select
                                                className="px-2 py-1 text-xs rounded border border-primary/30 bg-background"
                                                value={(subject.features.disposition as string) || ''}
                                                onChange={(e) => updateSubjectFeature('disposition', e.target.value || null)}
                                            >
                                                <option value="">—</option>
                                                {DISPOSITION_OPTIONS.map(d => (
                                                    <option key={d} value={d}>{DISPOSITION_LABELS[d]}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            formatNumber(result.subjectDispositionCoef, 2)
                                        )}
                                    </td>
                                    {/* Edad/Est. — editable (two inputs) */}
                                    <td className="px-3 py-3 text-sm text-center font-medium text-primary">
                                        {isEditing ? (
                                            <div className="flex gap-1 items-center justify-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    placeholder="años"
                                                    className="w-14 px-1 py-1 text-center text-xs rounded border border-primary/30 bg-background"
                                                    value={subject.features.age ?? ''}
                                                    onChange={(e) => updateSubjectFeature('age', parseNum(e.target.value))}
                                                />
                                                <select
                                                    className="px-1 py-1 text-xs rounded border border-primary/30 bg-background"
                                                    value={(subject.features.conservationState as string) || 'STATE_2'}
                                                    onChange={(e) => updateSubjectFeature('conservationState', e.target.value)}
                                                >
                                                    {CONSERVATION_OPTIONS.map(s => (
                                                        <option key={s} value={s}>{CONSERVATION_LABELS[s]}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : (
                                            formatNumber(result.subjectAgeCoef, 4)
                                        )}
                                    </td>
                                    {/* Calidad — subject always fixed at 1.00 */}
                                    <td className="px-3 py-3 text-sm text-center font-medium text-primary">{formatNumber(result.subjectQualityCoef, 2)}</td>
                                    <td className="px-3 py-3 text-sm text-center font-bold text-primary">{formatNumber(result.subjectTotalCoef, 4)}</td>
                                    <td className="px-3 py-3 text-sm text-right font-bold text-primary">
                                        {formatCurrency(result.subjectPriceM2, result.currency)}
                                    </td>
                                </tr>
                                {/* Comparable rows */}
                                {result.comparableAnalysis.map((analysis, index) => {
                                    // Defensa: property puede llegar como objeto vacío si la rehidratación
                                    // no encontró un row matching (tasación legacy con datos huérfanos).
                                    const prop = analysis.property || ({} as ValuationProperty)
                                    const f = (prop.features || {}) as Record<string, unknown>
                                    return (
                                        <tr key={index} className="hover:bg-muted/50 transition-colors">
                                            <td className="px-3 py-3 text-sm">
                                                <p className="font-medium text-foreground">Comp. {index + 1}</p>
                                                <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={prop.title}>
                                                    {prop.location || prop.title || 'Sin ubicación'}
                                                </p>
                                            </td>
                                            <td className="px-3 py-3 text-sm text-right font-medium text-foreground/80">
                                                {formatCurrency(prop.price || 0, result.currency)}
                                            </td>
                                            <td className="px-3 py-3 text-sm text-right text-muted-foreground">
                                                {formatNumber(analysis.homogenizedSurface)} m²
                                            </td>
                                            <td className="px-3 py-3 text-sm text-right text-muted-foreground">
                                                {formatCurrency(analysis.originalPriceM2, result.currency)}
                                            </td>
                                            {/* Ubic. — editable (number override) */}
                                            <td className="px-3 py-3 text-sm text-center font-medium">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.5"
                                                        max="1.5"
                                                        className="w-16 px-2 py-1 text-center text-xs rounded border border-border bg-background"
                                                        value={(f.locationCoefficient as number | undefined) ?? 1.0}
                                                        onChange={(e) => updateCompFeature(index, 'locationCoefficient', parseNum(e.target.value) ?? 1.0)}
                                                    />
                                                ) : (
                                                    formatNumber(analysis.locationCoefficient, 2)
                                                )}
                                            </td>
                                            {/* Piso — editable (number) */}
                                            <td className="px-3 py-3 text-sm text-center font-medium">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="w-16 px-2 py-1 text-center text-xs rounded border border-border bg-background"
                                                        value={(f.floor as number | undefined) ?? ''}
                                                        onChange={(e) => updateCompFeature(index, 'floor', parseNum(e.target.value))}
                                                    />
                                                ) : (
                                                    formatNumber(analysis.floorCoefficient, 2)
                                                )}
                                            </td>
                                            {/* Disp. — editable (select) */}
                                            <td className="px-3 py-3 text-sm text-center font-medium">
                                                {isEditing ? (
                                                    <select
                                                        className="px-2 py-1 text-xs rounded border border-border bg-background"
                                                        value={(f.disposition as string) || ''}
                                                        onChange={(e) => updateCompFeature(index, 'disposition', e.target.value || null)}
                                                    >
                                                        <option value="">—</option>
                                                        {DISPOSITION_OPTIONS.map(d => (
                                                            <option key={d} value={d}>{DISPOSITION_LABELS[d]}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    formatNumber(analysis.dispositionCoefficient, 2)
                                                )}
                                            </td>
                                            {/* Edad/Est. — editable (age + state) */}
                                            <td className="px-3 py-3 text-sm text-center font-medium">
                                                {isEditing ? (
                                                    <div className="flex gap-1 items-center justify-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            placeholder="años"
                                                            className="w-14 px-1 py-1 text-center text-xs rounded border border-border bg-background"
                                                            value={(f.age as number | undefined) ?? ''}
                                                            onChange={(e) => updateCompFeature(index, 'age', parseNum(e.target.value))}
                                                        />
                                                        <select
                                                            className="px-1 py-1 text-xs rounded border border-border bg-background"
                                                            value={(f.conservationState as string) || 'STATE_2'}
                                                            onChange={(e) => updateCompFeature(index, 'conservationState', e.target.value)}
                                                        >
                                                            {CONSERVATION_OPTIONS.map(s => (
                                                                <option key={s} value={s}>{CONSERVATION_LABELS[s]}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    formatNumber(analysis.ageCoefficient, 4)
                                                )}
                                            </td>
                                            {/* Calidad — editable (select) */}
                                            <td className="px-3 py-3 text-sm text-center font-medium">
                                                {isEditing ? (
                                                    <select
                                                        className="px-2 py-1 text-xs rounded border border-border bg-background"
                                                        value={(f.quality as string) || ''}
                                                        onChange={(e) => updateCompFeature(index, 'quality', e.target.value || null)}
                                                    >
                                                        <option value="">—</option>
                                                        {QUALITY_OPTIONS.map(q => (
                                                            <option key={q} value={q}>{QUALITY_LABELS[q]}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    formatNumber(analysis.qualityCoefficient, 2)
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-sm text-center font-bold">{formatNumber(analysis.totalCoefficient, 4)}</td>
                                            <td className="px-3 py-3 text-sm text-right font-bold text-primary">
                                                {formatCurrency(analysis.adjustedPriceM2, result.currency)}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot className="bg-secondary/40 font-medium">
                                <tr>
                                    <td colSpan={10} className="px-3 py-3 text-sm text-right border-t border-border">
                                        Promedio $/m² Ajustado:
                                    </td>
                                    <td className="px-3 py-3 text-sm text-right font-bold text-primary border-t border-border">
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
                        <li><strong>Piso:</strong> PB 0.90, 1° 0.85, 2° 0.93, 3°-4° 1.00, 5°-6° 1.05, 7°-8° 1.10, +8° 1.15</li>
                        <li><strong>Disposición:</strong> Frente 1.00, Contrafrente 0.95, Lateral 0.93, Interno 0.90</li>
                        <li><strong>Calidad Constructiva:</strong> Económica 0.90 a Excelente 1.275</li>
                        <li><strong>Depreciación:</strong> Método Ross-Heidecke según edad y estado de conservación (vida útil: 70 años)</li>
                        <li><strong>Zona de No Venta:</strong> Precio de publicación + 5%</li>
                    </ul>
                </div>
            </div>

            {/* Final Value */}
            {/* Mapa de Valores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-primary text-primary-foreground rounded-2xl p-8 text-center shadow-lg relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                    <p className="text-base opacity-90 mb-2 font-medium tracking-wide">PRECIO DE PUBLICACIÓN</p>
                    <p className="text-4xl font-extrabold tracking-tight mb-3">{formatCurrency(result.publicationPrice, result.currency)}</p>
                    <div className="inline-flex items-center gap-2 text-sm opacity-75 bg-black/20 px-3 py-1 rounded-full">
                        <span>{result.comparableAnalysis.length} propiedades comparadas</span>
                        <span>•</span>
                        <span>{formatNumber(result.subjectSurface)} m²</span>
                    </div>
                </div>
                <div className="bg-red-600 text-white rounded-2xl p-8 text-center shadow-lg relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                    <p className="text-base opacity-90 mb-2 font-medium tracking-wide">ZONA DE NO VENTA</p>
                    <p className="text-4xl font-extrabold tracking-tight mb-3">{formatCurrency(result.noSaleZonePrice, result.currency)}</p>
                    <p className="text-sm opacity-75">Precio por encima del cual la propiedad no se vende</p>
                </div>
            </div>

            {/* Cost Breakdown */}
            <div className="mb-10">
                <h2 className="text-xl font-semibold text-foreground mb-4">
                    Venta {subject.features.rooms ? `${subject.features.rooms} Ambientes` : ''} | {subject.location || 'Sin ubicación'}
                </h2>

                {/* Three value columns */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <Card className="shadow-none bg-primary/5 border-primary/20">
                        <CardContent className="p-4 text-center">
                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Valor Publicación</p>
                            <p className="text-2xl font-bold text-primary">{formatCurrency(result.publicationPrice, result.currency)}</p>
                        </CardContent>
                    </Card>
                    <Card className="shadow-none bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                        <CardContent className="p-4 text-center">
                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">
                                Valor Venta (
                                {ratesEditable ? (
                                    <span className="inline-flex items-center">
                                        -
                                        <input
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            max={100}
                                            value={effectiveRates.saleDiscountPercent}
                                            onChange={e => onExpenseRatesChange!({ saleDiscountPercent: Number(e.target.value) })}
                                            className="w-12 mx-1 rounded border px-1 py-0.5 text-xs text-right bg-background"
                                        />
                                        %
                                    </span>
                                ) : (
                                    <>-{effectiveRates.saleDiscountPercent}%</>
                                )}
                                )
                            </p>
                            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(result.saleValue, result.currency)}</p>
                        </CardContent>
                    </Card>
                    <Card className="shadow-none bg-secondary/20">
                        <CardContent className="p-4 text-center">
                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">
                                Valor Escritura (
                                {ratesEditable ? (
                                    <span className="inline-flex items-center">
                                        -
                                        <input
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            max={100}
                                            value={effectiveRates.deedDiscountPercent}
                                            onChange={e => onExpenseRatesChange!({ deedDiscountPercent: Number(e.target.value) })}
                                            className="w-12 mx-1 rounded border px-1 py-0.5 text-xs text-right bg-background"
                                        />
                                        %
                                    </span>
                                ) : (
                                    <>-{effectiveRates.deedDiscountPercent}%</>
                                )}
                                )
                            </p>
                            <p className="text-2xl font-bold text-foreground">{formatCurrency(result.deedValue, result.currency)}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Expenses table */}
                <div className="overflow-hidden rounded-lg border border-border">
                    <table className="min-w-full">
                        <thead className="bg-secondary/40">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gastos de Venta</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">%</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                            <tr>
                                <td className="px-4 py-3 text-sm">Sellos</td>
                                <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                                    {ratesEditable ? (
                                        <span className="inline-flex items-center gap-1 justify-end">
                                            <input
                                                type="number"
                                                step="0.01"
                                                min={0}
                                                max={100}
                                                value={effectiveRates.stampsPercent}
                                                onChange={e => onExpenseRatesChange!({ stampsPercent: Number(e.target.value) })}
                                                className="w-16 rounded border px-1 py-0.5 text-sm text-right bg-background"
                                            />
                                            <span>% s/escritura</span>
                                        </span>
                                    ) : (
                                        <>{effectiveRates.stampsPercent}% s/escritura</>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(result.stampsCost, result.currency)}</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3 text-sm">Gastos de Escritura</td>
                                <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                                    {ratesEditable ? (
                                        <span className="inline-flex items-center gap-1 justify-end">
                                            <input
                                                type="number"
                                                step="0.01"
                                                min={0}
                                                max={100}
                                                value={effectiveRates.deedExpensesPercent}
                                                onChange={e => onExpenseRatesChange!({ deedExpensesPercent: Number(e.target.value) })}
                                                className="w-16 rounded border px-1 py-0.5 text-sm text-right bg-background"
                                            />
                                            <span>% s/venta</span>
                                        </span>
                                    ) : (
                                        <>{effectiveRates.deedExpensesPercent}% s/venta</>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(result.deedExpenses, result.currency)}</td>
                            </tr>
                            <tr>
                                <td className="px-4 py-3 text-sm">Honorarios Inmobiliaria</td>
                                <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                                    {ratesEditable ? (
                                        <span className="inline-flex items-center gap-1 justify-end">
                                            <input
                                                type="number"
                                                step="0.01"
                                                min={0}
                                                max={100}
                                                value={effectiveRates.agencyFeesPercent}
                                                onChange={e => onExpenseRatesChange!({ agencyFeesPercent: Number(e.target.value) })}
                                                className="w-16 rounded border px-1 py-0.5 text-sm text-right bg-background"
                                            />
                                            <span>% s/venta</span>
                                        </span>
                                    ) : (
                                        <>{effectiveRates.agencyFeesPercent}% s/venta</>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(result.agencyFees, result.currency)}</td>
                            </tr>
                        </tbody>
                        <tfoot className="bg-secondary/40 font-semibold">
                            <tr>
                                <td className="px-4 py-3 text-sm" colSpan={2}>Total gastos de venta</td>
                                <td className="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400">{formatCurrency(result.totalExpenses, result.currency)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Money in hand */}
                <div className="mt-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-6 flex justify-between items-center">
                    <span className="text-base font-semibold text-green-800 dark:text-green-300">Dinero luego de venta</span>
                    <span className="text-3xl font-bold text-green-700 dark:text-green-400">{formatCurrency(result.moneyInHand, result.currency)}</span>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground uppercase tracking-widest">
                <p>Diego Ferreyra Gestión Inmobiliaria</p>
            </div>
        </div>
    )
}

export const ValuationReport = memo(ValuationReportInner)

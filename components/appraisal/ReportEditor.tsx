'use client'

import { ValuationProperty, ValuationResult, PurchaseResult } from '@/lib/valuation/calculator'
import { ReportEdits, SemaphoreColor } from '@/lib/types/report-edits'

interface ReportEditorProps {
    subject: ValuationProperty
    comparables: ValuationProperty[]
    overpriced: ValuationProperty[]
    purchaseProperties: ValuationProperty[]
    valuationResult: ValuationResult
    purchaseResult?: PurchaseResult
    reportEdits: ReportEdits
    onReportEditsChange: (edits: ReportEdits) => void
}

const SEMAPHORE_COLORS: { value: SemaphoreColor; label: string; bg: string; ring: string }[] = [
    { value: 'green', label: 'Verde', bg: 'bg-green-500', ring: 'ring-green-300' },
    { value: 'yellow', label: 'Amarillo', bg: 'bg-yellow-400', ring: 'ring-yellow-200' },
    { value: 'red', label: 'Rojo', bg: 'bg-red-500', ring: 'ring-red-300' },
]

function formatCurrency(value: number, currency: string = 'USD'): string {
    return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function ReportEditor({
    subject,
    comparables,
    overpriced,
    purchaseProperties,
    valuationResult,
    purchaseResult,
    reportEdits,
    onReportEditsChange,
}: ReportEditorProps) {
    function updateField<K extends keyof ReportEdits>(key: K, value: ReportEdits[K]) {
        onReportEditsChange({ ...reportEdits, [key]: value })
    }

    type PriceKey = 'publicationPrice' | 'saleValue' | 'noSaleZonePrice'
    function updatePriceOverride(key: PriceKey, value: number | undefined) {
        const next = { ...(reportEdits.priceOverrides || {}) }
        if (value === undefined || Number.isNaN(value)) delete next[key]
        else next[key] = value
        onReportEditsChange({
            ...reportEdits,
            priceOverrides: Object.keys(next).length > 0 ? next : undefined,
        })
    }

    function updateSemaphore(key: string, color: SemaphoreColor) {
        onReportEditsChange({
            ...reportEdits,
            semaphoreOverrides: { ...reportEdits.semaphoreOverrides, [key]: color },
        })
    }

    function getSemaphore(key: string, defaultColor: SemaphoreColor): SemaphoreColor {
        return reportEdits.semaphoreOverrides[key] || defaultColor
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 p-6">
            {/* Section Header */}
            <div className="text-center space-y-2 pb-4 border-b">
                <h2 className="text-2xl font-bold">Editor del Informe</h2>
                <p className="text-sm text-muted-foreground">
                    Edita los textos y colores del semaforo antes de generar el PDF final
                </p>
            </div>

            {/* 0. PRECIOS (override manual) */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b pb-2">Precios (manual)</h3>
                <p className="text-xs text-muted-foreground -mt-2">
                    Estos valores reemplazan los calculados en el PDF. Dejá el campo vacío para usar el valor
                    calculado. No actualiza las menciones de precio dentro de los textos de Análisis/Estrategia
                    (editá esos textos si querés reflejarlo ahí).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {([
                        { key: 'publicationPrice', label: 'Precio de Publicación', calc: valuationResult.publicationPrice },
                        { key: 'saleValue', label: 'Precio de Venta', calc: valuationResult.saleValue },
                        { key: 'noSaleZonePrice', label: 'Precio de No Venta', calc: valuationResult.noSaleZonePrice },
                    ] as const).map(({ key, label, calc }) => {
                        const override = reportEdits.priceOverrides?.[key]
                        return (
                            <div key={key} className="space-y-1.5">
                                <label className="text-sm font-medium">{label}</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    placeholder={`${valuationResult.currency} ${calc.toLocaleString('en-US')}`}
                                    value={override ?? ''}
                                    onChange={e => updatePriceOverride(key, e.target.value === '' ? undefined : Number(e.target.value))}
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-muted-foreground">
                                        Calculado: {formatCurrency(calc, valuationResult.currency)}
                                    </span>
                                    {override !== undefined && (
                                        <button
                                            type="button"
                                            onClick={() => updatePriceOverride(key, undefined)}
                                            className="text-[11px] text-primary underline hover:no-underline whitespace-nowrap"
                                        >
                                            Restablecer
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </section>

            {/* 1. PORTADA */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b pb-2">Portada</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Titulo del informe</label>
                        <input
                            type="text"
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            placeholder="INFORME DE TASACION"
                            value={reportEdits.coverTitle || ''}
                            onChange={e => updateField('coverTitle', e.target.value || undefined)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nombre de la propiedad</label>
                        <input
                            type="text"
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            placeholder={subject.title || subject.location || ''}
                            value={reportEdits.coverPropertyTitle || ''}
                            onChange={e => updateField('coverPropertyTitle', e.target.value || undefined)}
                        />
                    </div>
                </div>
            </section>

            {/* 2. PROPIEDAD A TASAR */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b pb-2">Propiedad a Tasar</h3>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Descripcion / Highlights</label>
                    <textarea
                        className="w-full rounded-md border px-3 py-2 text-sm min-h-[80px]"
                        placeholder={subject.description || 'Descripcion de la propiedad...'}
                        value={reportEdits.propertyDescription || ''}
                        onChange={e => updateField('propertyDescription', e.target.value || undefined)}
                    />
                </div>
            </section>

            {/* 3. SEMAFORO */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b pb-2">Semaforo del Mercado</h3>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Texto introductorio</label>
                    <textarea
                        className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
                        placeholder="En el camino hacia la venta exitosa, es clave estar en la zona correcta..."
                        value={reportEdits.semaphoreIntroText || ''}
                        onChange={e => updateField('semaphoreIntroText', e.target.value || undefined)}
                    />
                </div>
            </section>

            {/* 4. COMPARABLES - Semaphore picker */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b pb-2">
                    Comparables — Color del Semaforo
                </h3>
                <div className="space-y-3">
                    {comparables.map((comp, index) => (
                        <div key={index} className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                            <span className="text-sm font-medium flex-1 truncate">
                                {comp.location || comp.title || `Comparable ${index + 1}`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {formatCurrency(comp.price || 0, valuationResult.currency)}
                            </span>
                            <div className="flex gap-2">
                                {SEMAPHORE_COLORS.map(sc => (
                                    <button
                                        key={sc.value}
                                        onClick={() => updateSemaphore(`comparable-${index}`, sc.value)}
                                        className={`w-7 h-7 rounded-full ${sc.bg} transition-all ${getSemaphore(`comparable-${index}`, 'green') === sc.value
                                            ? `ring-2 ${sc.ring} scale-110`
                                            : 'opacity-40 hover:opacity-70'
                                        }`}
                                        title={sc.label}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* 5. OVERPRICED - Semaphore picker */}
            {overpriced.length > 0 && (
                <section className="space-y-4">
                    <h3 className="text-lg font-semibold text-red-600 border-b pb-2">
                        Fuera de Precio — Color del Semaforo
                    </h3>
                    <div className="space-y-3">
                        {overpriced.map((prop, index) => (
                            <div key={index} className="flex items-center gap-4 p-3 bg-red-50/50 dark:bg-red-950/10 rounded-lg">
                                <span className="text-sm font-medium flex-1 truncate">
                                    {prop.location || prop.title || `Overpriced ${index + 1}`}
                                </span>
                                <div className="flex gap-2">
                                    {SEMAPHORE_COLORS.map(sc => (
                                        <button
                                            key={sc.value}
                                            onClick={() => updateSemaphore(`overpriced-${index}`, sc.value)}
                                            className={`w-7 h-7 rounded-full ${sc.bg} transition-all ${getSemaphore(`overpriced-${index}`, 'red') === sc.value
                                                ? `ring-2 ${sc.ring} scale-110`
                                                : 'opacity-40 hover:opacity-70'
                                            }`}
                                            title={sc.label}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* 5b. PROPIEDADES PARA COMPRA - Semaphore picker */}
            {purchaseProperties.length > 0 && (
                <section className="space-y-4">
                    <h3 className="text-lg font-semibold text-primary border-b pb-2">
                        Propiedades para Compra — Color del Semaforo
                    </h3>
                    <div className="space-y-3">
                        {purchaseProperties.map((prop, index) => (
                            <div key={index} className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                                <span className="text-sm font-medium flex-1 truncate">
                                    {prop.location || prop.title || `Compra ${index + 1}`}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {formatCurrency(prop.price || 0, valuationResult.currency)}
                                </span>
                                <div className="flex gap-2">
                                    {SEMAPHORE_COLORS.map(sc => (
                                        <button
                                            key={sc.value}
                                            onClick={() => updateSemaphore(`purchase-${index}`, sc.value)}
                                            className={`w-7 h-7 rounded-full ${sc.bg} transition-all ${getSemaphore(`purchase-${index}`, 'green') === sc.value
                                                ? `ring-2 ${sc.ring} scale-110`
                                                : 'opacity-40 hover:opacity-70'
                                            }`}
                                            title={sc.label}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* 6. MAPA DE VALOR */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b pb-2">Mapa de Valor</h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Texto de metodologia</label>
                        <textarea
                            className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
                            placeholder="Para tasar la propiedad se utilizo el metodo de comparables..."
                            value={reportEdits.analysisMethodText || ''}
                            onChange={e => updateField('analysisMethodText', e.target.value || undefined)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Texto de analisis</label>
                        <textarea
                            className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
                            placeholder={`Debido a la competencia para tener visitas y potencial de venta la propiedad se deberia publicar en ${formatCurrency(valuationResult.publicationPrice, valuationResult.currency)}.`}
                            value={reportEdits.analysisText || ''}
                            onChange={e => updateField('analysisText', e.target.value || undefined)}
                        />
                    </div>
                </div>
            </section>

            {/* 7. ESTRATEGIA */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b pb-2">Estrategia de Venta</h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Estrategia de Precio</label>
                        <textarea
                            className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
                            placeholder="El valor de publicacion recomendado es..."
                            value={reportEdits.strategyPriceText || ''}
                            onChange={e => updateField('strategyPriceText', e.target.value || undefined)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Maxima Difusion</label>
                        <textarea
                            className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
                            placeholder="Tu propiedad merece tener maxima difusion..."
                            value={reportEdits.strategyDiffusionText || ''}
                            onChange={e => updateField('strategyDiffusionText', e.target.value || undefined)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Seguimiento y Mejora Continua</label>
                        <textarea
                            className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
                            placeholder="Cada 15 dias se haran informes de gestion quincenal..."
                            value={reportEdits.strategyFollowupText || ''}
                            onChange={e => updateField('strategyFollowupText', e.target.value || undefined)}
                        />
                    </div>
                </div>
            </section>

            {/* 8. AUTORIZACION Y HONORARIOS */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b pb-2">Autorizacion y Honorarios</h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Autorizacion Exclusiva, Compartida</label>
                        <textarea
                            className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
                            placeholder="La autorizacion es exclusiva y la propiedad se compartira con todas las inmobiliarias..."
                            value={reportEdits.authorizationText || ''}
                            onChange={e => updateField('authorizationText', e.target.value || undefined)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Honorarios</label>
                        <textarea
                            className="w-full rounded-md border px-3 py-2 text-sm min-h-[60px]"
                            placeholder="La retribucion en concepto de honorarios por el servicio a brindar es del 3%..."
                            value={reportEdits.feesText || ''}
                            onChange={e => updateField('feesText', e.target.value || undefined)}
                        />
                    </div>
                </div>
            </section>
        </div>
    )
}

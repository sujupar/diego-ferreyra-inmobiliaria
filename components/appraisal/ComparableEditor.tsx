'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrapedProperty } from '@/lib/scraper/types'
import { DispositionType, QualityType, ConservationStateType, textoCoeficienteEstado } from '@/lib/valuation/rules'
import { calculateHomogenizedSurface } from '@/lib/valuation/calculator'
import { requiereConversion } from '@/lib/valuation/moneda'
import { completarDescubiertaDeducida, confirmarDescubierta } from '@/lib/scraper/superficie-deducida'
import { formatCurrency } from '@/lib/valuation/utils'
import {
    X,
    Edit2,
    Check,
    AlertCircle,
    ExternalLink,
    Building2,
    Sparkles
} from 'lucide-react'

interface ComparableEditorProps {
    property: ScrapedProperty
    onSave: (property: ScrapedProperty) => void
    onCancel: () => void
    /** Quitar el comparable (p. ej. un aviso en pesos que no se quiere convertir). */
    onDiscard?: () => void
}

// Check which required fields are missing
function getMissingFields(property: ScrapedProperty): string[] {
    const missing: string[] = []
    const f = property.features

    if (!f.coveredArea && f.coveredArea !== 0) missing.push('Superficie Cubierta')
    if (!f.age && f.age !== 0) missing.push('Antigüedad')
    if (!f.disposition) missing.push('Disposición')
    if (!f.quality) missing.push('Calidad Constructiva')
    if (!f.conservationState) missing.push('Estado de Conservación')
    if (!property.price) missing.push('Precio')
    // Un precio en otra moneda no se puede promediar con los de USD (B6).
    else if (requiereConversion(property.currency)) missing.push(`Precio en USD (el aviso está en ${property.currency})`)

    return missing
}

export function ComparableEditor({ property, onSave, onCancel, onDiscard }: ComparableEditorProps) {
    // Red de seguridad: si el portal solo dio total + cubierta, se deduce la
    // descubierta MARCADA como deducida, para que se revise (B9).
    const [editedProperty, setEditedProperty] = useState<ScrapedProperty>(() => ({
        ...property,
        features: completarDescubiertaDeducida(property.features),
    }))
    const descubiertaDeducida = editedProperty.features.uncoveredAreaDeducida === true

    const missingFields = getMissingFields(editedProperty)
    const enOtraMoneda = requiereConversion(editedProperty.currency)
    const isValid = missingFields.length === 0

    const updateFeature = <K extends keyof typeof editedProperty.features>(
        key: K,
        value: typeof editedProperty.features[K]
    ) => {
        setEditedProperty(prev => ({
            ...prev,
            features: {
                ...prev.features,
                [key]: value
            }
        }))
    }

    const handleSave = () => {
        if (isValid) {
            onSave(editedProperty)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-card rounded-2xl border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b p-4 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-lg">Completar Datos del Comparable</h3>
                        <p className="text-sm text-muted-foreground">
                            Completa los campos faltantes para la tasación
                        </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cerrar el editor del comparable">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Property Preview */}
                <div className="p-4 bg-muted/30 border-b">
                    <div className="flex gap-4">
                        {editedProperty.images?.[0] && (
                            <img
                                src={editedProperty.images[0]}
                                alt="Property"
                                className="w-24 h-24 rounded-lg object-cover"
                            />
                        )}
                        <div className="flex-1">
                            <h4 className="font-medium line-clamp-1">{editedProperty.title}</h4>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                                {editedProperty.location}
                            </p>
                            {editedProperty.url && (
                                <a
                                    href={editedProperty.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    Ver publicación
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Missing fields alert */}
                {missingFields.length > 0 && (
                    <div className="mx-4 mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                Campos requeridos faltantes:
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                {missingFields.join(', ')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Aviso en otra moneda: no entra al promedio hasta convertirlo (B6). */}
                {enOtraMoneda && (
                    <div role="alert" className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800 dark:text-red-200">
                            <p className="font-medium">
                                Este aviso está publicado en {editedProperty.currency}
                                {editedProperty.price ? ` (${formatCurrency(editedProperty.price, editedProperty.currency)})` : ''}.
                            </p>
                            <p className="text-xs mt-1">
                                El tasador promedia en dólares: cargá el precio convertido a USD en «Precio (USD)»
                                {onDiscard ? ' o descartá este comparable' : ''}. Hasta entonces no entra al cálculo.
                            </p>
                        </div>
                    </div>
                )}

                {/* Form */}
                <div className="p-4 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="comparable-precio">Precio (USD) *</Label>
                            <Input
                                id="comparable-precio"
                                type="number"
                                // En otra moneda el campo arranca vacío: lo que se carga
                                // acá es el precio EN USD, y al cargarlo queda en USD.
                                value={enOtraMoneda ? '' : (editedProperty.price || '')}
                                onChange={(e) => setEditedProperty(prev => ({
                                    ...prev,
                                    price: e.target.value ? Number(e.target.value) : null,
                                    currency: e.target.value ? 'USD' : prev.currency,
                                }))}
                                placeholder={enOtraMoneda ? 'Precio convertido a USD' : '450000'}
                                className={!editedProperty.price || enOtraMoneda ? 'border-amber-400' : ''}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Superficie Cubierta (m²) *</Label>
                            <Input
                                type="number"
                                value={editedProperty.features.coveredArea || ''}
                                onChange={(e) => updateFeature('coveredArea', e.target.value ? Number(e.target.value) : null)}
                                placeholder="48"
                                className={!editedProperty.features.coveredArea ? 'border-amber-400' : ''}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Superficie Semicubierta (m²)</Label>
                            <Input
                                type="number"
                                value={editedProperty.features.semiCoveredArea || ''}
                                onChange={(e) => updateFeature('semiCoveredArea', e.target.value ? Number(e.target.value) : null)}
                                placeholder="0"
                            />
                            <p className="text-xs text-muted-foreground">Balcones techados, galerías (se calcula al 50%)</p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="comparable-descubierta">Superficie Descubierta (m²)</Label>
                                {descubiertaDeducida && (
                                    <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                                        deducida: revisar
                                    </span>
                                )}
                            </div>
                            <Input
                                id="comparable-descubierta"
                                type="number"
                                value={editedProperty.features.uncoveredArea || ''}
                                onChange={(e) => setEditedProperty(prev => ({
                                    ...prev,
                                    // Cargarla a mano es confirmarla: deja de ser deducida.
                                    features: confirmarDescubierta(prev.features, e.target.value ? Number(e.target.value) : null),
                                }))}
                                placeholder="12"
                                className={descubiertaDeducida ? 'border-amber-400' : ''}
                            />
                            {descubiertaDeducida ? (
                                <p className="text-xs text-amber-700">
                                    Calculada como total − cubierta ({editedProperty.features.totalArea ?? '—'} − {editedProperty.features.coveredArea ?? '—'} m²): el portal no la informa.
                                    Verificala en el aviso.{' '}
                                    <button
                                        type="button"
                                        className="underline hover:no-underline"
                                        onClick={() => setEditedProperty(prev => ({ ...prev, features: confirmarDescubierta(prev.features) }))}
                                    >
                                        Está bien
                                    </button>
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">Patios, balcones, terrazas (se calcula al 50%)</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-primary font-medium">M² Homologados</Label>
                            <div className="h-10 flex items-center px-3 bg-primary/10 border border-primary/20 rounded-md text-primary font-semibold">
                                {/* La MISMA fórmula que el cálculo (C5): antes este número
                                    ignoraba la semicubierta y no coincidía con el informe. */}
                                {`${calculateHomogenizedSurface({
                                    coveredArea: editedProperty.features.coveredArea ?? undefined,
                                    semiCoveredArea: editedProperty.features.semiCoveredArea ?? undefined,
                                    uncoveredArea: editedProperty.features.uncoveredArea ?? undefined,
                                }).toLocaleString('es-AR', { maximumFractionDigits: 1 })} m²`}
                            </div>
                            <p className="text-xs text-muted-foreground">= Cubierta + (Semicubierta + Descubierta) × 0,5</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Antigüedad (años) *</Label>
                            <Input
                                type="number"
                                value={editedProperty.features.age ?? ''}
                                onChange={(e) => updateFeature('age', e.target.value ? Number(e.target.value) : null)}
                                placeholder="15"
                                className={editedProperty.features.age === null || editedProperty.features.age === undefined ? 'border-amber-400' : ''}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Piso</Label>
                            <Input
                                type="number"
                                value={editedProperty.features.floor ?? ''}
                                onChange={(e) => updateFeature('floor', e.target.value ? Number(e.target.value) : null)}
                                placeholder="0 = PB"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Coef. Ubicación (J)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={editedProperty.features.locationCoefficient ?? 1}
                                onChange={(e) => updateFeature('locationCoefficient', e.target.value ? Number(e.target.value) : 1)}
                                placeholder="1.00"
                            />
                            <p className="text-xs text-muted-foreground">0.95 a 1.05 (1.0 = ubicación estándar)</p>
                        </div>
                    </div>

                    {/* Disposition */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <Label className="text-base font-medium">Disposición *</Label>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { value: 'FRONT', label: 'Frente (1.00)' },
                                { value: 'BACK', label: 'Contrafrente (0.95)' },
                                { value: 'LATERAL', label: 'Lateral (0.93)' },
                                { value: 'INTERNAL', label: 'Interno (0.90)' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => updateFeature('disposition', opt.value as DispositionType)}
                                    className={`p-3 rounded-lg border-2 transition-all duration-200 ${editedProperty.features.disposition === opt.value
                                        ? 'border-primary bg-primary/10'
                                        : 'border-muted hover:border-primary/50'
                                        } ${!editedProperty.features.disposition ? 'border-amber-300' : ''}`}
                                >
                                    <p className="text-sm font-medium">{opt.label}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Quality */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <Label className="text-base font-medium">Calidad Constructiva *</Label>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                            {[
                                { value: 'EXCELLENT', label: 'Excelente (1.25-1.30)' },
                                { value: 'VERY_GOOD', label: 'Muy Buena (1.15-1.20)' },
                                { value: 'GOOD', label: 'Buena (1.05-1.10)' },
                                { value: 'GOOD_ECONOMIC', label: 'Buena Econ. (1.00)' },
                                { value: 'ECONOMIC', label: 'Económica (0.90)' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => updateFeature('quality', opt.value as QualityType)}
                                    className={`p-2 rounded-lg border-2 transition-all duration-200 ${editedProperty.features.quality === opt.value
                                        ? 'border-primary bg-primary/10'
                                        : 'border-muted hover:border-primary/50'
                                        } ${!editedProperty.features.quality ? 'border-amber-300' : ''}`}
                                >
                                    <p className="text-xs font-medium">{opt.label}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Conservation State */}
                    <div className="space-y-3">
                        <Label className="text-base font-medium">Estado de Conservación *</Label>
                        <p className="text-xs text-muted-foreground">
                            Coeficiente que se aplica {editedProperty.features.age == null ? 'a estrenar (cargá la antigüedad)' : `con ${editedProperty.features.age} años`}.
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            {/* Coeficiente que se APLICA con la antigüedad de este comparable,
                                no el % de la tabla (auditoría 2026-10-03, C1). */}
                            {([
                                { value: 'STATE_1', label: 'Estado 1 — Nuevo' },
                                { value: 'STATE_1_5', label: 'Estado 1.5 — Nuevo/Normal' },
                                { value: 'STATE_2', label: 'Estado 2 — Normal' },
                                { value: 'STATE_2_5', label: 'Estado 2.5 — Normal/Repar.' },
                                { value: 'STATE_3', label: 'Estado 3 — Reparaciones' },
                                { value: 'STATE_3_5', label: 'Estado 3.5 — Senc./Imp.' },
                                { value: 'STATE_4', label: 'Estado 4 — Repar. Imp.' },
                                { value: 'STATE_4_5', label: 'Estado 4.5 — Imp./Demol.' },
                                { value: 'STATE_5', label: 'Estado 5 — Demolición' },
                            ] satisfies Array<{ value: ConservationStateType; label: string }>).map(opt => ({
                                ...opt,
                                label: `${opt.label} (${textoCoeficienteEstado(opt.value, editedProperty.features.age)})`,
                            })).map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => updateFeature('conservationState', opt.value)}
                                    className={`p-2 rounded-lg border-2 transition-all duration-200 ${editedProperty.features.conservationState === opt.value
                                        ? 'border-primary bg-primary/10'
                                        : 'border-muted hover:border-primary/50'
                                        } ${!editedProperty.features.conservationState ? 'border-amber-300' : ''}`}
                                >
                                    <p className="text-xs font-medium">{opt.label}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t p-4 flex justify-end gap-3">
                    {onDiscard && (
                        <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={onDiscard}>
                            Descartar comparable
                        </Button>
                    )}
                    <Button variant="outline" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isValid}
                        className="gap-2"
                    >
                        <Check className="h-4 w-4" />
                        Guardar Comparable
                    </Button>
                </div>
            </div>
        </div>
    )
}

// Helper component to show missing fields indicator
export function ComparableMissingIndicator({ property }: { property: ScrapedProperty }) {
    const missing = getMissingFields(property)

    if (missing.length === 0) {
        return (
            <span className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Completo
            </span>
        )
    }

    return (
        <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {missing.length} campo{missing.length > 1 ? 's' : ''} faltante{missing.length > 1 ? 's' : ''}
        </span>
    )
}

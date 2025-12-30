'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrapedProperty } from '@/lib/scraper/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Ruler, Calendar, ArrowUpFromLine, DollarSign, BedDouble, Bath, Car } from 'lucide-react'
import {
    DISPOSITION_LABELS,
    QUALITY_LABELS,
    CONSERVATION_LABELS
} from '@/lib/valuation/rules'
import { Badge } from '@/components/ui/badge'

interface PropertyManualEditProps {
    property: ScrapedProperty
    onChange: (updated: ScrapedProperty) => void
}

export function PropertyManualEdit({ property, onChange }: PropertyManualEditProps) {
    const [data, setData] = useState(property)

    const updateFeature = (key: string, value: any) => {
        const updated = {
            ...data,
            features: { ...data.features, [key]: value }
        }
        setData(updated)
        onChange(updated)
    }

    return (
        <div className="mt-8 space-y-8">
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h3 className="text-xl font-semibold tracking-tight text-primary">Detalles de la Propiedad</h3>
                    <p className="text-sm text-muted-foreground mt-1">Verifica y edita la información obtenida para mayor precisión.</p>
                </div>
            </div>

            {/* Main Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                    <Label className="text-base font-medium">Título de la Publicación</Label>
                    <Input
                        className="h-12 bg-secondary/20 border-border/50 focus:border-primary/50 text-lg"
                        value={data.title || ''}
                        onChange={e => {
                            const updated = { ...data, title: e.target.value }
                            setData(updated)
                            onChange(updated)
                        }}
                    />
                </div>
                <div className="space-y-3">
                    <Label className="text-base font-medium">Ubicación</Label>
                    <Input
                        className="h-12 bg-secondary/20 border-border/50 focus:border-primary/50 text-lg"
                        value={data.location || ''}
                        onChange={e => {
                            const updated = { ...data, location: e.target.value }
                            setData(updated)
                            onChange(updated)
                        }}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="shadow-sm hover:shadow-md transition-shadow border-border/60 bg-card">
                    <CardHeader className="p-4 pb-2 space-y-0 text-muted-foreground">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                            <DollarSign className="w-3.5 h-3.5" /> Precio
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-medium text-muted-foreground">{data.currency || '$'}</span>
                            <Input
                                type="number"
                                className="h-9 border-0 p-0 text-2xl font-bold focus-visible:ring-0 w-full bg-transparent shadow-none"
                                value={data.price || ''}
                                onChange={e => {
                                    const updated = { ...data, price: Number(e.target.value) }
                                    setData(updated)
                                    onChange(updated)
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow border-border/60 bg-card">
                    <CardHeader className="p-4 pb-2 space-y-0 text-muted-foreground">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                            <Ruler className="w-3.5 h-3.5" /> Sup. Cubierta
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="flex items-baseline gap-1">
                            <Input
                                type="number"
                                className="h-9 border-0 p-0 text-2xl font-bold focus-visible:ring-0 w-24 bg-transparent shadow-none"
                                value={data.features.coveredArea || ''}
                                onChange={e => updateFeature('coveredArea', Number(e.target.value))}
                            />
                            <span className="text-sm font-medium text-muted-foreground">m²</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow border-border/60 bg-card">
                    <CardHeader className="p-4 pb-2 space-y-0 text-muted-foreground">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                            <Ruler className="w-3.5 h-3.5" /> Sup. Total
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="flex items-baseline gap-1">
                            <Input
                                type="number"
                                className="h-9 border-0 p-0 text-2xl font-bold focus-visible:ring-0 w-24 bg-transparent shadow-none"
                                value={data.features.totalArea || ''}
                                onChange={e => updateFeature('totalArea', Number(e.target.value))}
                            />
                            <span className="text-sm font-medium text-muted-foreground">m²</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow border-border/60 bg-card">
                    <CardHeader className="p-4 pb-2 space-y-0 text-muted-foreground">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" /> Antigüedad
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="flex items-baseline gap-1">
                            <Input
                                type="number"
                                className="h-9 border-0 p-0 text-2xl font-bold focus-visible:ring-0 w-24 bg-transparent shadow-none"
                                value={data.features.age || ''}
                                onChange={e => updateFeature('age', Number(e.target.value))}
                            />
                            <span className="text-sm font-medium text-muted-foreground">años</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow border-border/60 bg-card">
                    <CardHeader className="p-4 pb-2 space-y-0 text-muted-foreground">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                            <BedDouble className="w-3.5 h-3.5" /> Dormitorios
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <Input
                            type="number"
                            className="h-9 border-0 p-0 text-2xl font-bold focus-visible:ring-0 w-24 bg-transparent shadow-none"
                            value={data.features.bedrooms || ''}
                            onChange={e => updateFeature('bedrooms', Number(e.target.value))}
                        />
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow border-border/60 bg-card">
                    <CardHeader className="p-4 pb-2 space-y-0 text-muted-foreground">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                            <Bath className="w-3.5 h-3.5" /> Baños
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <Input
                            type="number"
                            className="h-9 border-0 p-0 text-2xl font-bold focus-visible:ring-0 w-24 bg-transparent shadow-none"
                            value={data.features.bathrooms || ''}
                            onChange={e => updateFeature('bathrooms', Number(e.target.value))}
                        />
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow border-border/60 bg-card">
                    <CardHeader className="p-4 pb-2 space-y-0 text-muted-foreground">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                            <Car className="w-3.5 h-3.5" /> Cocheras
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <Input
                            type="number"
                            className="h-9 border-0 p-0 text-2xl font-bold focus-visible:ring-0 w-24 bg-transparent shadow-none"
                            value={data.features.garages || ''}
                            onChange={e => updateFeature('garages', Number(e.target.value))}
                        />
                    </CardContent>
                </Card>

                <Card className="shadow-sm hover:shadow-md transition-shadow border-border/60 bg-card">
                    <CardHeader className="p-4 pb-2 space-y-0 text-muted-foreground">
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                            <ArrowUpFromLine className="w-3.5 h-3.5" /> Piso
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <Input
                            type="number"
                            className="h-9 border-0 p-0 text-2xl font-bold focus-visible:ring-0 w-24 bg-transparent shadow-none"
                            value={data.features.floor || ''}
                            placeholder="PB=0"
                            onChange={e => updateFeature('floor', Number(e.target.value))}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Valuation Coefficients Section */}
            <div className="bg-secondary/20 rounded-2xl p-6 md:p-8 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">Ajustes</Badge>
                    <h4 className="text-lg font-semibold tracking-tight text-primary">Coeficientes de Tasación</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Disposición</Label>
                        <select
                            className="flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow shadow-sm"
                            value={data.features.disposition || ''}
                            onChange={e => updateFeature('disposition', e.target.value || undefined)}
                        >
                            <option value="">Seleccionar...</option>
                            {Object.entries(DISPOSITION_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Calidad Constructiva</Label>
                        <select
                            className="flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow shadow-sm"
                            value={data.features.quality || ''}
                            onChange={e => updateFeature('quality', e.target.value || undefined)}
                        >
                            <option value="">Seleccionar...</option>
                            {Object.entries(QUALITY_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Estado de Conservación</Label>
                        <select
                            className="flex h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-shadow shadow-sm"
                            value={data.features.conservationState || ''}
                            onChange={e => updateFeature('conservationState', e.target.value || undefined)}
                        >
                            <option value="">Seleccionar...</option>
                            {Object.entries(CONSERVATION_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <Label className="text-base font-medium">Descripción</Label>
                <textarea
                    className="flex min-h-[100px] w-full rounded-xl border border-input bg-secondary/10 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    rows={4}
                    value={data.description || ''}
                    onChange={e => {
                        const updated = { ...data, description: e.target.value }
                        setData(updated)
                        onChange(updated)
                    }}
                />
            </div>
        </div>
    )
}

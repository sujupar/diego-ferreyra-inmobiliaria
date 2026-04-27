'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface SubjectFeaturesEditableValues {
    coveredArea?: number | null
    uncoveredArea?: number | null
    rooms?: number | null
    bedrooms?: number | null
    bathrooms?: number | null
    age?: number | null
    floor?: number | null
    totalFloors?: number | null
    garages?: number | null
}

interface Props {
    value: SubjectFeaturesEditableValues
    onChange: (next: SubjectFeaturesEditableValues) => void
}

const FIELDS: Array<{ key: keyof SubjectFeaturesEditableValues; label: string; suffix?: string; step?: string }> = [
    { key: 'coveredArea', label: 'Sup. Cubierta', suffix: 'm²' },
    { key: 'uncoveredArea', label: 'Sup. Descubierta', suffix: 'm²' },
    { key: 'rooms', label: 'Ambientes' },
    { key: 'bedrooms', label: 'Dormitorios' },
    { key: 'bathrooms', label: 'Baños' },
    { key: 'age', label: 'Antigüedad', suffix: 'años' },
    { key: 'floor', label: 'Piso' },
    { key: 'totalFloors', label: 'Pisos totales' },
    { key: 'garages', label: 'Cocheras' },
]

export function SubjectFeaturesEditor({ value, onChange }: Props) {
    function handleField(key: keyof SubjectFeaturesEditableValues, raw: string) {
        const parsed = raw === '' ? null : Number(raw)
        if (raw !== '' && Number.isNaN(parsed)) return
        onChange({ ...value, [key]: parsed })
    }
    return (
        <div className="space-y-3 rounded-lg border bg-card p-4">
            <h4 className="text-sm font-semibold">Datos de la Propiedad (editables)</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {FIELDS.map(f => (
                    <div key={f.key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            {f.label}{f.suffix ? ` (${f.suffix})` : ''}
                        </Label>
                        <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={f.step || '1'}
                            value={value[f.key] ?? ''}
                            onChange={e => handleField(f.key, e.target.value)}
                            className="h-9 text-sm"
                        />
                    </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
                Los cambios se reflejan en el PDF y en la tasación al recalcular.
            </p>
        </div>
    )
}

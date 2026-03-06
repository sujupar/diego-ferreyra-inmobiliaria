'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Stepper, StepContent } from '@/components/ui/stepper'
import { ScrapedProperty, PropertyFeatures } from '@/lib/scraper/types'
import { DispositionType, QualityType, ConservationStateType } from '@/lib/valuation/rules'
import {
    MapPin,
    Ruler,
    Home,
    Building2,
    Sparkles,
    ImageIcon,
    ArrowRight,
    ArrowLeft,
    Check,
    Save,
    X
} from 'lucide-react'

// Step definitions
const WIZARD_STEPS = [
    { title: 'Ubicación', description: 'Dirección y barrio', icon: MapPin },
    { title: 'Superficies', description: 'Metros cuadrados', icon: Ruler },
    { title: 'Espacios', description: 'Ambientes y baños', icon: Home },
    { title: 'Edificio', description: 'Piso y antigüedad', icon: Building2 },
    { title: 'Características', description: 'Calidad y estado', icon: Sparkles },
    { title: 'Imágenes', description: 'Fotos (opcional)', icon: ImageIcon },
]

// Form data interface
interface PropertyFormData {
    // Step 1: Location
    address: string
    neighborhood: string
    city: string

    // Step 2: Surfaces
    coveredArea: number | ''
    semiCoveredArea: number | ''
    uncoveredArea: number | ''
    totalArea: number | ''

    // Step 3: Spaces
    rooms: number | ''
    bedrooms: number | ''
    bathrooms: number | ''
    garages: number | ''

    // Step 4: Building
    floor: number | ''
    totalFloors: number | ''
    age: number | ''

    // Step 5: Characteristics
    disposition: DispositionType | ''
    quality: QualityType | ''
    conservationState: ConservationStateType | ''

    // Step 6: Images
    images: string[]
}

const initialFormData: PropertyFormData = {
    address: '',
    neighborhood: '',
    city: 'Ciudad Autónoma de Buenos Aires',
    coveredArea: '',
    semiCoveredArea: '',
    uncoveredArea: '',
    totalArea: '',
    rooms: '',
    bedrooms: '',
    bathrooms: '',
    garages: '',
    floor: '',
    totalFloors: '',
    age: '',
    disposition: '',
    quality: '',
    conservationState: '',
    images: [],
}

interface PropertyWizardProps {
    onComplete: (property: ScrapedProperty) => void
    initialData?: Partial<PropertyFormData>
}

export function PropertyWizard({ onComplete, initialData }: PropertyWizardProps) {
    const [currentStep, setCurrentStep] = useState(0)
    const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
    const [formData, setFormData] = useState<PropertyFormData>(() => ({
        ...initialFormData,
        ...initialData,
    }))
    const [isSaving, setIsSaving] = useState(false)
    const [savedMessage, setSavedMessage] = useState(false)

    // Auto-calculate total area (homogenized: covered 100% + semi 50% + uncovered 50%)
    useEffect(() => {
        const covered = Number(formData.coveredArea) || 0
        const semiCovered = Number(formData.semiCoveredArea) || 0
        const uncovered = Number(formData.uncoveredArea) || 0
        const total = covered + (semiCovered * 0.5) + (uncovered * 0.5)

        if (total > 0) {
            setFormData(prev => ({ ...prev, totalArea: total }))
        }
    }, [formData.coveredArea, formData.semiCoveredArea, formData.uncoveredArea])

    const fileInputRef = useRef<HTMLInputElement>(null)

    // Image upload handler
    const handleImageFiles = useCallback((files: FileList | null) => {
        if (!files) return
        const validTypes = ['image/jpeg', 'image/png', 'image/webp']
        const maxSize = 5 * 1024 * 1024 // 5MB

        Array.from(files).forEach(file => {
            if (!validTypes.includes(file.type)) return
            if (file.size > maxSize) return

            const reader = new FileReader()
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string
                if (dataUrl) {
                    setFormData(prev => ({
                        ...prev,
                        images: [...prev.images, dataUrl]
                    }))
                }
            }
            reader.readAsDataURL(file)
        })
    }, [])

    const removeImage = useCallback((index: number) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }))
    }, [])

    // Auto-save simulation (exclude images to avoid exceeding localStorage limit)
    const autoSave = useCallback(() => {
        setIsSaving(true)
        const { images, ...dataWithoutImages } = formData
        localStorage.setItem('propertyWizardDraft', JSON.stringify(dataWithoutImages))

        setTimeout(() => {
            setIsSaving(false)
            setSavedMessage(true)
            setTimeout(() => setSavedMessage(false), 2000)
        }, 500)
    }, [formData])

    // Auto-save on step change
    useEffect(() => {
        const timeout = setTimeout(autoSave, 1000)
        return () => clearTimeout(timeout)
    }, [currentStep, autoSave])

    // Load saved draft on mount
    useEffect(() => {
        const saved = localStorage.getItem('propertyWizardDraft')
        if (saved && !initialData) {
            try {
                const parsed = JSON.parse(saved)
                setFormData(prev => ({ ...prev, ...parsed }))
            } catch (e) {
                console.error('Error loading draft:', e)
            }
        }
    }, [initialData])

    const updateField = <K extends keyof PropertyFormData>(
        field: K,
        value: PropertyFormData[K]
    ) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const goNext = () => {
        if (currentStep < WIZARD_STEPS.length - 1) {
            setDirection('forward')
            setCurrentStep(prev => prev + 1)
        }
    }

    const goPrev = () => {
        if (currentStep > 0) {
            setDirection('backward')
            setCurrentStep(prev => prev - 1)
        }
    }

    const handleComplete = () => {
        // Convert form data to ScrapedProperty
        const property: ScrapedProperty = {
            title: formData.address,
            location: `${formData.address}, ${formData.neighborhood}, ${formData.city}`,
            price: null,
            currency: 'USD',
            images: formData.images,
            description: '',
            url: '',
            portal: 'manual',
            features: {
                coveredArea: Number(formData.coveredArea) || null,
                uncoveredArea: Number(formData.uncoveredArea) || null,
                totalArea: Number(formData.totalArea) || null,
                rooms: Number(formData.rooms) || null,
                bedrooms: Number(formData.bedrooms) || null,
                bathrooms: Number(formData.bathrooms) || null,
                garages: Number(formData.garages) || null,
                floor: Number(formData.floor) || null,
                totalFloors: Number(formData.totalFloors) || null,
                expenses: null,
                orientation: null,
                disposal: null,
                condition: null,
                age: Number(formData.age) || null,
                disposition: formData.disposition || undefined,
                quality: formData.quality || undefined,
                conservationState: formData.conservationState || undefined,
            },
        }

        // Clear draft
        localStorage.removeItem('propertyWizardDraft')

        onComplete(property)
    }

    const isStepValid = (step: number): boolean => {
        switch (step) {
            case 0:
                return formData.address.trim() !== '' && formData.neighborhood.trim() !== ''
            case 1:
                return Number(formData.coveredArea) > 0
            case 2:
                return Number(formData.rooms) > 0
            case 3:
                return formData.age !== ''
            case 4:
                return formData.disposition !== '' && formData.quality !== '' && formData.conservationState !== ''
            case 5:
                return true // Images are optional
            default:
                return true
        }
    }

    const canProceed = isStepValid(currentStep)
    const isLastStep = currentStep === WIZARD_STEPS.length - 1

    return (
        <div className="space-y-8">
            {/* Stepper */}
            <Stepper
                steps={WIZARD_STEPS.map(s => ({ title: s.title, description: s.description }))}
                currentStep={currentStep}
            />

            {/* Auto-save indicator */}
            <div className="flex items-center justify-end h-6">
                {isSaving && (
                    <span className="text-xs text-muted-foreground animate-pulse flex items-center gap-1">
                        <Save className="h-3 w-3" />
                        Guardando...
                    </span>
                )}
                {savedMessage && (
                    <span className="text-xs text-green-600 flex items-center gap-1 animate-in fade-in duration-300">
                        <Check className="h-3 w-3" />
                        Guardado automáticamente
                    </span>
                )}
            </div>

            {/* Step content */}
            <div className="min-h-[400px] bg-gradient-to-br from-card via-card to-muted/20 rounded-2xl border shadow-lg p-6 md:p-8">

                {/* Step 1: Location */}
                <StepContent isActive={currentStep === 0} direction={direction}>
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                <MapPin className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Ubicación de la Propiedad</h3>
                                <p className="text-sm text-muted-foreground">Ingresa la dirección exacta</p>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="address">Dirección *</Label>
                                <Input
                                    id="address"
                                    placeholder="Ej: Av. Corrientes 1234, Piso 5°"
                                    value={formData.address}
                                    onChange={(e) => updateField('address', e.target.value)}
                                    className="h-12 text-lg"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="neighborhood">Barrio *</Label>
                                    <Input
                                        id="neighborhood"
                                        placeholder="Ej: Palermo"
                                        value={formData.neighborhood}
                                        onChange={(e) => updateField('neighborhood', e.target.value)}
                                        className="h-12"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="city">Ciudad</Label>
                                    <Input
                                        id="city"
                                        value={formData.city}
                                        onChange={(e) => updateField('city', e.target.value)}
                                        className="h-12"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </StepContent>

                {/* Step 2: Surfaces */}
                <StepContent isActive={currentStep === 1} direction={direction}>
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                <Ruler className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Superficies</h3>
                                <p className="text-sm text-muted-foreground">Metros cuadrados de la propiedad</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="coveredArea">Superficie Cubierta (m²) *</Label>
                                <Input
                                    id="coveredArea"
                                    type="number"
                                    placeholder="80"
                                    value={formData.coveredArea}
                                    onChange={(e) => updateField('coveredArea', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12 text-lg"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="semiCoveredArea">Semi-Cubierta (m²)</Label>
                                <Input
                                    id="semiCoveredArea"
                                    type="number"
                                    placeholder="10"
                                    value={formData.semiCoveredArea}
                                    onChange={(e) => updateField('semiCoveredArea', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="uncoveredArea">Descubierta (m²)</Label>
                                <Input
                                    id="uncoveredArea"
                                    type="number"
                                    placeholder="15"
                                    value={formData.uncoveredArea}
                                    onChange={(e) => updateField('uncoveredArea', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="totalArea">Superficie Total (m²)</Label>
                                <Input
                                    id="totalArea"
                                    type="number"
                                    placeholder="105"
                                    value={formData.totalArea}
                                    onChange={(e) => updateField('totalArea', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12 bg-muted/50"
                                />
                                <p className="text-xs text-muted-foreground">Se calcula automáticamente</p>
                            </div>
                        </div>
                    </div>
                </StepContent>

                {/* Step 3: Spaces */}
                <StepContent isActive={currentStep === 2} direction={direction}>
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                <Home className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Espacios</h3>
                                <p className="text-sm text-muted-foreground">Cantidad de ambientes</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="rooms">Ambientes *</Label>
                                <Input
                                    id="rooms"
                                    type="number"
                                    placeholder="4"
                                    value={formData.rooms}
                                    onChange={(e) => updateField('rooms', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12 text-lg"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bedrooms">Dormitorios</Label>
                                <Input
                                    id="bedrooms"
                                    type="number"
                                    placeholder="3"
                                    value={formData.bedrooms}
                                    onChange={(e) => updateField('bedrooms', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bathrooms">Baños</Label>
                                <Input
                                    id="bathrooms"
                                    type="number"
                                    placeholder="2"
                                    value={formData.bathrooms}
                                    onChange={(e) => updateField('bathrooms', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="garages">Cocheras</Label>
                                <Input
                                    id="garages"
                                    type="number"
                                    placeholder="1"
                                    value={formData.garages}
                                    onChange={(e) => updateField('garages', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12"
                                />
                            </div>
                        </div>
                    </div>
                </StepContent>

                {/* Step 4: Building */}
                <StepContent isActive={currentStep === 3} direction={direction}>
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                <Building2 className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Edificio</h3>
                                <p className="text-sm text-muted-foreground">Información del edificio</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="floor">Piso</Label>
                                <Input
                                    id="floor"
                                    type="number"
                                    placeholder="5"
                                    value={formData.floor}
                                    onChange={(e) => updateField('floor', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12 text-lg"
                                />
                                <p className="text-xs text-muted-foreground">0 = Planta Baja</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="totalFloors">Total Pisos</Label>
                                <Input
                                    id="totalFloors"
                                    type="number"
                                    placeholder="10"
                                    value={formData.totalFloors}
                                    onChange={(e) => updateField('totalFloors', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="age">Antigüedad (años) *</Label>
                                <Input
                                    id="age"
                                    type="number"
                                    placeholder="15"
                                    value={formData.age}
                                    onChange={(e) => updateField('age', e.target.value ? Number(e.target.value) : '')}
                                    className="h-12 text-lg"
                                />
                            </div>
                        </div>

                    </div>
                </StepContent>

                {/* Step 5: Characteristics */}
                <StepContent isActive={currentStep === 4} direction={direction}>
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Características</h3>
                                <p className="text-sm text-muted-foreground">Calidad y estado de la propiedad</p>
                            </div>
                        </div>

                        <div className="grid gap-6">
                            {/* Disposition */}
                            <div className="space-y-3">
                                <Label className="text-base font-medium">Disposición *</Label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { value: 'FRONT', label: 'Frente', desc: 'Coef. 1.00' },
                                        { value: 'BACK', label: 'Contrafrente', desc: 'Coef. 0.95' },
                                        { value: 'LATERAL', label: 'Lateral', desc: 'Coef. 0.93' },
                                        { value: 'INTERNAL', label: 'A patio interior', desc: 'Coef. 0.90' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => updateField('disposition', opt.value as DispositionType)}
                                            className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${formData.disposition === opt.value
                                                ? 'border-primary bg-primary/10 shadow-md'
                                                : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                                                }`}
                                        >
                                            <p className="font-medium">{opt.label}</p>
                                            <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quality */}
                            <div className="space-y-3">
                                <Label className="text-base font-medium">Calidad Constructiva *</Label>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {[
                                        { value: 'EXCELLENT', label: 'Excelente', color: 'text-green-600', desc: '1.25 – 1.30' },
                                        { value: 'VERY_GOOD', label: 'Muy Buena', color: 'text-blue-600', desc: '1.15 – 1.20' },
                                        { value: 'GOOD', label: 'Buena', color: 'text-cyan-600', desc: '1.05 – 1.10' },
                                        { value: 'GOOD_ECONOMIC', label: 'Buena Económica', color: 'text-gray-600', desc: '1.00' },
                                        { value: 'ECONOMIC', label: 'Económica', color: 'text-orange-600', desc: '0.90' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => updateField('quality', opt.value as QualityType)}
                                            className={`p-3 rounded-xl border-2 transition-all duration-200 text-left ${formData.quality === opt.value
                                                ? 'border-primary bg-primary/10 shadow-md'
                                                : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                                                }`}
                                        >
                                            <p className={`font-medium ${opt.color}`}>{opt.label}</p>
                                            <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Conservation State */}
                            <div className="space-y-3">
                                <Label className="text-base font-medium">Estado de Conservación *</Label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {[
                                        { value: 'STATE_1', label: 'Estado 1 — Nuevo', desc: 'Depreciación 0%' },
                                        { value: 'STATE_1_5', label: 'Estado 1.5', desc: 'Entre nuevo y normal' },
                                        { value: 'STATE_2', label: 'Estado 2 — Normal', desc: 'Depreciación 2.52%' },
                                        { value: 'STATE_2_5', label: 'Estado 2.5', desc: 'Entre normal y reparaciones' },
                                        { value: 'STATE_3', label: 'Estado 3 — Reparaciones', desc: 'Depreciación 18.10%' },
                                        { value: 'STATE_3_5', label: 'Estado 3.5', desc: 'Entre sencillas e importantes' },
                                        { value: 'STATE_4', label: 'Estado 4 — Repar. Importantes', desc: 'Depreciación 52.6%' },
                                        { value: 'STATE_4_5', label: 'Estado 4.5', desc: 'Entre importantes y demolición' },
                                        { value: 'STATE_5', label: 'Estado 5 — Demolición', desc: 'Depreciación 100%' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => updateField('conservationState', opt.value as ConservationStateType)}
                                            className={`p-3 rounded-xl border-2 transition-all duration-200 text-left ${formData.conservationState === opt.value
                                                ? 'border-primary bg-primary/10 shadow-md'
                                                : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                                                }`}
                                        >
                                            <p className="font-medium">{opt.label}</p>
                                            <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </StepContent>

                {/* Step 6: Images */}
                <StepContent isActive={currentStep === 5} direction={direction}>
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                <ImageIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Imágenes (Opcional)</h3>
                                <p className="text-sm text-muted-foreground">Agrega fotos de la propiedad</p>
                            </div>
                        </div>

                        {/* Hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                handleImageFiles(e.target.files)
                                e.target.value = ''
                            }}
                        />

                        {/* Drop zone */}
                        <div
                            className="border-2 border-dashed border-muted-foreground/25 rounded-2xl p-12 text-center hover:border-primary/50 transition-colors duration-300 cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/5') }}
                            onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary', 'bg-primary/5') }}
                            onDrop={(e) => {
                                e.preventDefault()
                                e.currentTarget.classList.remove('border-primary', 'bg-primary/5')
                                handleImageFiles(e.dataTransfer.files)
                            }}
                        >
                            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground mb-2">Arrastra fotos aquí o haz clic para seleccionar</p>
                            <p className="text-xs text-muted-foreground">Formatos: JPG, PNG, WEBP (max. 5MB por imagen)</p>
                            <Button variant="outline" className="mt-4 pointer-events-none">
                                Seleccionar Archivos
                            </Button>
                        </div>

                        {/* Image preview grid */}
                        {formData.images.length > 0 && (
                            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                                {formData.images.map((img, index) => (
                                    <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border">
                                        <img src={img} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                                        {index === 0 && (
                                            <span className="absolute top-1 left-1 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                                Principal
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); removeImage(index) }}
                                            className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="bg-muted/30 rounded-xl p-4">
                            <p className="text-sm text-muted-foreground">
                                La primera imagen se usara como foto principal en el informe PDF.
                            </p>
                        </div>
                    </div>
                </StepContent>
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between items-center pt-4">
                <Button
                    variant="ghost"
                    onClick={goPrev}
                    disabled={currentStep === 0}
                    className="gap-2 h-12 px-6"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Anterior
                </Button>

                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                        Paso {currentStep + 1} de {WIZARD_STEPS.length}
                    </span>
                </div>

                {isLastStep ? (
                    <Button
                        onClick={handleComplete}
                        disabled={!canProceed}
                        className="gap-2 h-12 px-8 bg-green-600 hover:bg-green-700"
                    >
                        <Check className="h-4 w-4" />
                        Completar
                    </Button>
                ) : (
                    <Button
                        onClick={goNext}
                        disabled={!canProceed}
                        className="gap-2 h-12 px-6"
                    >
                        Siguiente
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}

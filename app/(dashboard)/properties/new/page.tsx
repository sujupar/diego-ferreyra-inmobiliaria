'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Home, DollarSign, FileText, MapPin, ArrowLeft, User, ImageIcon } from 'lucide-react'

export default function NewPropertyPage() {
    return (
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <NewPropertyContent />
        </Suspense>
    )
}

interface PrefillState {
    appraisalId: string | null
    contactId: string | null
}

function NewPropertyContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const appraisalIdParam = searchParams.get('appraisalId')
    const dealId = searchParams.get('dealId')
    const scheduledAppraisalId = searchParams.get('scheduledAppraisalId')

    const [loading, setLoading] = useState(false)
    const [prefilling, setPrefilling] = useState(!!appraisalIdParam || !!dealId || !!scheduledAppraisalId)
    const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
    const [dealData, setDealData] = useState<{ contact_id?: string; appraisal_id?: string; assigned_to?: string; property_address?: string; contacts?: { full_name?: string }; profiles?: { full_name?: string } } | null>(null)
    const [prefillIds, setPrefillIds] = useState<PrefillState>({ appraisalId: null, contactId: null })
    const [form, setForm] = useState({
        address: '', neighborhood: '', city: 'CABA', property_type: 'departamento',
        rooms: '', bedrooms: '', bathrooms: '', garages: '',
        covered_area: '', total_area: '', floor: '', age: '',
        asking_price: '', currency: 'USD', commission_percentage: '3',
        contract_start_date: '', contract_end_date: '',
        origin: appraisalIdParam ? 'tasacion' : '', assigned_to: '',
        description: '',
    })
    const [photos, setPhotos] = useState<string[]>([])

    // Cargar lista de asesores
    useEffect(() => {
        fetch('/api/users/advisors')
            .then(r => r.ok ? r.json() : { data: [] })
            .then(j => setAdvisors(j.data || []))
            .catch(() => { })
    }, [])

    // Prefill unificado: resolvemos appraisalId desde dealId o param directo,
    // y fetcheamos la tasación una sola vez con todos los datos.
    useEffect(() => {
        let cancelled = false

        async function loadPrefill() {
            if (!dealId && !appraisalIdParam && !scheduledAppraisalId) {
                setPrefilling(false)
                return
            }
            setPrefilling(true)

            try {
                let appraisalId = appraisalIdParam
                let dealContactId: string | undefined
                let dealAssignedTo: string | undefined
                let dealAddress: string | undefined

                if (dealId) {
                    const r = await fetch(`/api/deals/${dealId}`)
                    const j = await r.json()
                    const deal = j.data
                    if (cancelled) return
                    if (deal) {
                        setDealData(deal)
                        appraisalId = deal.appraisal_id || appraisalId
                        dealContactId = deal.contact_id
                        dealAssignedTo = deal.assigned_to
                        dealAddress = deal.property_address
                    }
                }

                if (!appraisalId && scheduledAppraisalId) {
                    // No deal ni appraisal directa — precargamos desde la tasación agendada.
                    const sr = await fetch(`/api/scheduled-appraisals/${scheduledAppraisalId}`)
                    if (!sr.ok) {
                        setPrefillIds({ appraisalId: null, contactId: null })
                        return
                    }
                    const sj = await sr.json()
                    const scheduled = sj.data
                    if (cancelled || !scheduled) return

                    if (scheduled.appraisal_id) {
                        // Si ya tiene tasación vinculada, la usamos para prefill completo.
                        appraisalId = scheduled.appraisal_id
                    } else {
                        // Sin tasación: precarga mínima desde la scheduled_appraisal.
                        setForm(prev => ({
                            ...prev,
                            address: scheduled.property_address || prev.address,
                            origin: 'tasacion',
                            assigned_to: scheduled.assigned_to || prev.assigned_to,
                        }))
                        setPrefillIds({ appraisalId: null, contactId: scheduled.contact_id || null })
                        return
                    }
                }

                if (!appraisalId) {
                    // Solo dealId sin appraisal vinculada — precarga mínima desde el deal.
                    setForm(prev => ({
                        ...prev,
                        address: dealAddress || prev.address,
                        origin: 'tasacion',
                        assigned_to: dealAssignedTo || prev.assigned_to,
                    }))
                    setPrefillIds({ appraisalId: null, contactId: dealContactId || null })
                    return
                }

                const ar = await fetch(`/api/appraisals/${appraisalId}`)
                const aj = await ar.json()
                const appr = aj.data || aj
                if (cancelled || !appr) return

                const f = (appr.property_features || {}) as Record<string, unknown>
                const num = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v))

                setForm(prev => ({
                    ...prev,
                    address: appr.property_title || dealAddress || appr.property_location || prev.address,
                    neighborhood: appr.property_location?.split(',')[1]?.trim() || prev.neighborhood,
                    asking_price: appr.publication_price ? String(appr.publication_price) : prev.asking_price,
                    currency: appr.property_currency || appr.currency || prev.currency,
                    rooms: num(f.rooms),
                    bedrooms: num(f.bedrooms),
                    bathrooms: num(f.bathrooms),
                    covered_area: num(f.coveredArea),
                    total_area: num(f.totalArea),
                    floor: num(f.floor),
                    age: num(f.age),
                    description: appr.property_description || prev.description,
                    origin: 'tasacion',
                    assigned_to: dealAssignedTo || appr.assigned_to || prev.assigned_to,
                }))
                if (Array.isArray(appr.property_images)) setPhotos(appr.property_images)
                setPrefillIds({
                    appraisalId,
                    contactId: dealContactId || appr.contact_id || null,
                })
            } catch (err) {
                console.error('[properties/new] prefill error:', err)
            } finally {
                if (!cancelled) setPrefilling(false)
            }
        }

        loadPrefill()
        return () => { cancelled = true }
    }, [dealId, appraisalIdParam, scheduledAppraisalId])

    function updateField(field: string, value: string) {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    function removePhoto(idx: number) {
        setPhotos(prev => prev.filter((_, i) => i !== idx))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        try {
            const body = {
                appraisal_id: prefillIds.appraisalId || dealData?.appraisal_id || appraisalIdParam || undefined,
                contact_id: prefillIds.contactId || dealData?.contact_id || undefined,
                address: form.address,
                neighborhood: form.neighborhood,
                city: form.city,
                property_type: form.property_type,
                rooms: form.rooms ? parseInt(form.rooms) : undefined,
                bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
                bathrooms: form.bathrooms ? parseInt(form.bathrooms) : undefined,
                garages: form.garages ? parseInt(form.garages) : undefined,
                covered_area: form.covered_area ? parseFloat(form.covered_area) : undefined,
                total_area: form.total_area ? parseFloat(form.total_area) : undefined,
                floor: form.floor ? parseInt(form.floor) : undefined,
                age: form.age ? parseInt(form.age) : undefined,
                asking_price: parseFloat(form.asking_price),
                currency: form.currency,
                commission_percentage: parseFloat(form.commission_percentage),
                contract_start_date: form.contract_start_date || undefined,
                contract_end_date: form.contract_end_date || undefined,
                origin: form.origin || undefined,
                assigned_to: form.assigned_to || undefined,
                description: form.description || undefined,
                photos: photos.length > 0 ? photos : undefined,
                status: 'pending_docs',
            }

            const res = await fetch('/api/properties', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Error al crear')
            }

            const { id } = await res.json()

            if (dealId) {
                try {
                    await fetch(`/api/deals/${dealId}/advance`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ stage: 'captured', property_id: id }),
                    })
                } catch (e) { console.error('Error linking deal:', e) }
            }

            router.push(`/properties/${id}`)
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Error al crear la propiedad')
        } finally {
            setLoading(false)
        }
    }

    if (prefilling) {
        return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Button>

            <div>
                <h1 className="text-2xl font-bold tracking-tight">Captar Propiedad</h1>
                <p className="text-muted-foreground">
                    {dealData
                        ? `Registrando propiedad captada del proceso de ${dealData.contacts?.full_name || 'contacto'}`
                        : appraisalIdParam ? 'Creando propiedad asociada a tasación' : 'Crear propiedad captada desde cero'}
                </p>
            </div>

            {dealData && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-center gap-3">
                    <User className="h-5 w-5 text-green-600 shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            Contacto: {dealData.contacts?.full_name}
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300">
                            {dealData.property_address} — Asesor: {dealData.profiles?.full_name || 'Sin asignar'}
                        </p>
                    </div>
                </div>
            )}

            {prefillIds.appraisalId && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-sm">
                    Datos precargados desde la tasación. Revisalos antes de captar.
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5" />Ubicación</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Dirección *</Label>
                                <Input value={form.address} onChange={e => updateField('address', e.target.value)} required placeholder="Av. Corrientes 1234" />
                            </div>
                            <div className="space-y-2">
                                <Label>Barrio *</Label>
                                <Input value={form.neighborhood} onChange={e => updateField('neighborhood', e.target.value)} required placeholder="Palermo" />
                            </div>
                            <div className="space-y-2">
                                <Label>Ciudad</Label>
                                <Input value={form.city} onChange={e => updateField('city', e.target.value)} placeholder="CABA" />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo</Label>
                                <select value={form.property_type} onChange={e => updateField('property_type', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <option value="departamento">Departamento</option>
                                    <option value="casa">Casa</option>
                                    <option value="ph">PH</option>
                                    <option value="local">Local</option>
                                    <option value="oficina">Oficina</option>
                                    <option value="terreno">Terreno</option>
                                </select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Home className="h-5 w-5" />Características</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="space-y-2"><Label>Ambientes</Label><Input type="number" value={form.rooms} onChange={e => updateField('rooms', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Dormitorios</Label><Input type="number" value={form.bedrooms} onChange={e => updateField('bedrooms', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Baños</Label><Input type="number" value={form.bathrooms} onChange={e => updateField('bathrooms', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Cocheras</Label><Input type="number" value={form.garages} onChange={e => updateField('garages', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Sup. Cubierta (m²)</Label><Input type="number" value={form.covered_area} onChange={e => updateField('covered_area', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Sup. Total (m²)</Label><Input type="number" value={form.total_area} onChange={e => updateField('total_area', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Piso</Label><Input type="number" value={form.floor} onChange={e => updateField('floor', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Antigüedad (años)</Label><Input type="number" value={form.age} onChange={e => updateField('age', e.target.value)} /></div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" />Descripción</CardTitle></CardHeader>
                    <CardContent>
                        <textarea
                            value={form.description}
                            onChange={e => updateField('description', e.target.value)}
                            placeholder="Descripción comercial de la propiedad…"
                            rows={5}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                        />
                    </CardContent>
                </Card>

                {photos.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <ImageIcon className="h-5 w-5" />Fotos heredadas ({photos.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground mb-3">
                                Estas fotos vienen de la tasación. Quitá las que no quieras conservar.
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {photos.map((url, i) => (
                                    <div key={`${url}-${i}`} className="relative group aspect-square rounded-md overflow-hidden border">
                                        <Image
                                            src={url}
                                            alt={`Foto ${i + 1}`}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                            sizes="(max-width: 640px) 50vw, 25vw"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removePhoto(i)}
                                            className="absolute top-1 right-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Quitar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><DollarSign className="h-5 w-5" />Datos Comerciales</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Precio *</Label>
                                <Input type="number" value={form.asking_price} onChange={e => updateField('asking_price', e.target.value)} required placeholder="150000" />
                            </div>
                            <div className="space-y-2">
                                <Label>Moneda</Label>
                                <select value={form.currency} onChange={e => updateField('currency', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <option value="USD">USD</option>
                                    <option value="ARS">ARS</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Comisión (%)</Label>
                                <Input type="number" step="0.5" value={form.commission_percentage} onChange={e => updateField('commission_percentage', e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Inicio contrato</Label><Input type="date" value={form.contract_start_date} onChange={e => updateField('contract_start_date', e.target.value)} /></div>
                            <div className="space-y-2"><Label>Fin contrato</Label><Input type="date" value={form.contract_end_date} onChange={e => updateField('contract_end_date', e.target.value)} /></div>
                        </div>
                    </CardContent>
                </Card>

                {!dealData && (
                    <Card>
                        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" />Origen y Asignación</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Origen</Label>
                                    <select value={form.origin} onChange={e => updateField('origin', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                        <option value="">Seleccionar...</option>
                                        <option value="embudo">Embudo</option>
                                        <option value="referido">Referido</option>
                                        <option value="historico">Historico</option>
                                        <option value="tasacion">Tasacion</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Asesor asignado</Label>
                                    <select value={form.assigned_to} onChange={e => updateField('assigned_to', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                        <option value="">Sin asignar</option>
                                        {advisors.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
                    <Button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Captar Propiedad
                    </Button>
                </div>
            </form>
        </div>
    )
}

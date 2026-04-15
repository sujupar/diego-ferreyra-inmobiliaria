'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Home, DollarSign, FileText, MapPin, ArrowLeft, User } from 'lucide-react'

export default function NewPropertyPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <NewPropertyContent />
    </Suspense>
  )
}

function NewPropertyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appraisalId = searchParams.get('appraisalId')
  const dealId = searchParams.get('dealId')

  const [loading, setLoading] = useState(false)
  const [prefilling, setPrefilling] = useState(!!appraisalId || !!dealId)
  const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
  const [dealData, setDealData] = useState<any>(null)
  const [form, setForm] = useState({
    address: '', neighborhood: '', city: 'CABA', property_type: 'departamento',
    rooms: '', bedrooms: '', bathrooms: '', garages: '',
    covered_area: '', total_area: '', floor: '', age: '',
    asking_price: '', currency: 'USD', commission_percentage: '3',
    contract_start_date: '', contract_end_date: '',
    origin: appraisalId ? 'tasacion' : '', assigned_to: '',
  })

  // Load advisors
  useEffect(() => {
    fetch('/api/users/advisors')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setAdvisors(j.data || []))
      .catch(() => {})
  }, [])

  // Prefill from deal
  useEffect(() => {
    if (!dealId) return
    setPrefilling(true)
    fetch(`/api/deals/${dealId}`)
      .then(r => r.json())
      .then(json => {
        const deal = json.data
        if (deal) {
          setDealData(deal)
          setForm(prev => ({
            ...prev,
            address: deal.property_address || '',
            origin: 'tasacion',
            assigned_to: deal.assigned_to || '',
          }))
          // If the deal has an appraisal, also fetch appraisal data
          if (deal.appraisal_id) {
            fetch(`/api/appraisals/${deal.appraisal_id}`)
              .then(r => r.json())
              .then(appr => {
                if (appr) {
                  const f = appr.property_features || {}
                  setForm(prev => ({
                    ...prev,
                    address: appr.property_title || appr.property_location || prev.address,
                    neighborhood: appr.property_location?.split(',')[1]?.trim() || prev.neighborhood,
                    asking_price: appr.publication_price ? String(appr.publication_price) : prev.asking_price,
                    currency: appr.currency || prev.currency,
                    rooms: f.rooms ? String(f.rooms) : prev.rooms,
                    bedrooms: f.bedrooms ? String(f.bedrooms) : prev.bedrooms,
                    bathrooms: f.bathrooms ? String(f.bathrooms) : prev.bathrooms,
                    covered_area: f.coveredArea ? String(f.coveredArea) : prev.covered_area,
                    total_area: f.totalArea ? String(f.totalArea) : prev.total_area,
                    floor: f.floor ? String(f.floor) : prev.floor,
                    age: f.age ? String(f.age) : prev.age,
                  }))
                }
              })
              .catch(() => {})
          }
        }
      })
      .catch(err => console.error(err))
      .finally(() => setPrefilling(false))
  }, [dealId])

  // Prefill from appraisal (legacy)
  useEffect(() => {
    if (!appraisalId || dealId) return
    fetch(`/api/pipeline`)
      .then(r => r.json())
      .then(data => {
        const appr = (data.appraisals || []).find((a: any) => a.id === appraisalId)
        if (appr) {
          setForm(prev => ({
            ...prev,
            address: appr.title || '',
            neighborhood: appr.location || '',
            asking_price: String(appr.price || ''),
            currency: appr.currency || 'USD',
            origin: 'tasacion',
          }))
        }
      })
      .finally(() => setPrefilling(false))
  }, [appraisalId, dealId])

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const body = {
        appraisal_id: dealData?.appraisal_id || appraisalId || undefined,
        contact_id: dealData?.contact_id || undefined,
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

      // Link property to deal and advance to captured
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
            : appraisalId ? 'Creando propiedad asociada a tasación' : 'Crear propiedad captada desde cero'}
        </p>
      </div>

      {/* Deal context banner */}
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Ubicación */}
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

        {/* Características */}
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

        {/* Datos comerciales */}
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

        {/* Origen y asignación */}
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

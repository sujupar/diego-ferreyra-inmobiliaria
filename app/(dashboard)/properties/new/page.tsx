'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Home, DollarSign, FileText, MapPin } from 'lucide-react'

export default function NewPropertyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appraisalId = searchParams.get('appraisalId')

  const [loading, setLoading] = useState(false)
  const [prefilling, setPrefilling] = useState(!!appraisalId)
  const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
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

  // Prefill from appraisal
  useEffect(() => {
    if (!appraisalId) return
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
  }, [appraisalId])

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const body = {
        appraisal_id: appraisalId || undefined,
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva Propiedad</h1>
        <p className="text-muted-foreground">
          {appraisalId ? 'Creando propiedad asociada a tasacion' : 'Crear propiedad captada desde cero'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Ubicacion */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5" />Ubicacion</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Direccion *</Label>
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

        {/* Caracteristicas */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Home className="h-5 w-5" />Caracteristicas</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>Ambientes</Label><Input type="number" value={form.rooms} onChange={e => updateField('rooms', e.target.value)} /></div>
              <div className="space-y-2"><Label>Dormitorios</Label><Input type="number" value={form.bedrooms} onChange={e => updateField('bedrooms', e.target.value)} /></div>
              <div className="space-y-2"><Label>Banos</Label><Input type="number" value={form.bathrooms} onChange={e => updateField('bathrooms', e.target.value)} /></div>
              <div className="space-y-2"><Label>Cocheras</Label><Input type="number" value={form.garages} onChange={e => updateField('garages', e.target.value)} /></div>
              <div className="space-y-2"><Label>Sup. Cubierta (m2)</Label><Input type="number" value={form.covered_area} onChange={e => updateField('covered_area', e.target.value)} /></div>
              <div className="space-y-2"><Label>Sup. Total (m2)</Label><Input type="number" value={form.total_area} onChange={e => updateField('total_area', e.target.value)} /></div>
              <div className="space-y-2"><Label>Piso</Label><Input type="number" value={form.floor} onChange={e => updateField('floor', e.target.value)} /></div>
              <div className="space-y-2"><Label>Antiguedad (anos)</Label><Input type="number" value={form.age} onChange={e => updateField('age', e.target.value)} /></div>
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
                <Label>Comision (%)</Label>
                <Input type="number" step="0.5" value={form.commission_percentage} onChange={e => updateField('commission_percentage', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Inicio contrato</Label><Input type="date" value={form.contract_start_date} onChange={e => updateField('contract_start_date', e.target.value)} /></div>
              <div className="space-y-2"><Label>Fin contrato</Label><Input type="date" value={form.contract_end_date} onChange={e => updateField('contract_end_date', e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Origen y asignacion */}
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" />Origen y Asignacion</CardTitle></CardHeader>
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

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear Propiedad
          </Button>
        </div>
      </form>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CalendarDays, MapPin, User, FileText, Tag, Home } from 'lucide-react'

export default function AgendarTasacionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
  const [form, setForm] = useState({
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    propertyAddress: '',
    scheduledDate: '',
    scheduledTime: '',
    origin: '',
    assignedTo: '',
    notes: '',
    propertyType: '' as '' | 'departamento' | 'casa' | 'ph' | 'otro',
    propertyTypeOther: '',
    neighborhood: '',
    rooms: '' as string,
    coveredArea: '' as string,
  })

  useEffect(() => {
    fetch('/api/users/advisors')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setAdvisors(j.data || []))
      .catch(() => {})
  }, [])

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: form.contactName,
          contact_phone: form.contactPhone,
          contact_email: form.contactEmail,
          property_address: form.propertyAddress,
          scheduled_date: form.scheduledDate,
          scheduled_time: form.scheduledTime || null,
          origin: form.origin || null,
          assigned_to: form.assignedTo || null,
          notes: form.notes || null,
          property_type: form.propertyType,
          property_type_other: form.propertyType === 'otro' ? form.propertyTypeOther : null,
          neighborhood: form.neighborhood,
          rooms: form.rooms ? parseInt(form.rooms, 10) : null,
          covered_area: form.coveredArea ? parseFloat(form.coveredArea) : null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al agendar')
      }

      setSuccess(true)
      setTimeout(() => router.push('/pipeline'), 1500)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al agendar')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <div className="text-4xl mb-4">&#10003;</div>
            <h2 className="text-xl font-bold mb-2">Tasación Coordinada</h2>
            <p className="text-muted-foreground">Redirigiendo al pipeline...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Coordinar Tasación</h1>
        <p className="text-muted-foreground">Coordiná una nueva tasación para un prospecto</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Origen y Asignacion */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5" />
              Origen y Asignacion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="origin">Origen *</Label>
                <select
                  id="origin"
                  value={form.origin}
                  onChange={e => updateField('origin', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Seleccionar origen...</option>
                  <option value="embudo">Embudo (Landing Page)</option>
                  <option value="referido">Referido</option>
                  <option value="historico">Historico</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignedTo">Asesor asignado *</Label>
                <select
                  id="assignedTo"
                  value={form.assignedTo}
                  onChange={e => updateField('assignedTo', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Seleccionar asesor...</option>
                  {advisors.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contacto */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" />
              Datos del Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactName">Nombre completo *</Label>
                <Input id="contactName" value={form.contactName} onChange={e => updateField('contactName', e.target.value)} placeholder="Juan Perez" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Telefono *</Label>
                <Input id="contactPhone" type="tel" value={form.contactPhone} onChange={e => updateField('contactPhone', e.target.value)} placeholder="+54 11 1234-5678" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Email</Label>
              <Input id="contactEmail" type="email" value={form.contactEmail} onChange={e => updateField('contactEmail', e.target.value)} placeholder="juan@email.com" />
            </div>
          </CardContent>
        </Card>

        {/* Datos de la Propiedad */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Home className="h-5 w-5" />
              Datos de la Propiedad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="propertyType">Tipo de Propiedad *</Label>
                <select
                  id="propertyType"
                  value={form.propertyType}
                  onChange={e => updateField('propertyType', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Seleccionar...</option>
                  <option value="departamento">Departamento</option>
                  <option value="casa">Casa</option>
                  <option value="ph">PH</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              {form.propertyType === 'otro' && (
                <div className="space-y-2">
                  <Label htmlFor="propertyTypeOther">Especificar tipo *</Label>
                  <Input
                    id="propertyTypeOther"
                    value={form.propertyTypeOther}
                    onChange={e => updateField('propertyTypeOther', e.target.value)}
                    placeholder="Ej: Local comercial, Terreno..."
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="neighborhood">Barrio *</Label>
                <Input
                  id="neighborhood"
                  value={form.neighborhood}
                  onChange={e => updateField('neighborhood', e.target.value)}
                  placeholder="Ej: Palermo, Belgrano, CABA"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rooms">Cantidad de Ambientes *</Label>
                <select
                  id="rooms"
                  value={form.rooms}
                  onChange={e => updateField('rooms', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Seleccionar...</option>
                  <option value="1">1 ambiente (monoambiente)</option>
                  <option value="2">2 ambientes</option>
                  <option value="3">3 ambientes</option>
                  <option value="4">4 ambientes</option>
                  <option value="5">5 ambientes</option>
                  <option value="6">6 o más</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coveredArea">
                  Metros cuadrados cubiertos <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  id="coveredArea"
                  type="number"
                  min="0"
                  step="1"
                  value={form.coveredArea}
                  onChange={e => updateField('coveredArea', e.target.value)}
                  placeholder="Ej: 75"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Propiedad y Fecha */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" />
              Propiedad y Fecha
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="propertyAddress">Direccion de la propiedad *</Label>
              <Input id="propertyAddress" value={form.propertyAddress} onChange={e => updateField('propertyAddress', e.target.value)} placeholder="Av. Corrientes 1234, CABA" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledDate">Fecha *</Label>
                <Input id="scheduledDate" type="date" value={form.scheduledDate} onChange={e => updateField('scheduledDate', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledTime">Hora</Label>
                <Input id="scheduledTime" type="time" value={form.scheduledTime} onChange={e => updateField('scheduledTime', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Notas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Notas adicionales..."
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Coordinar Tasación
          </Button>
        </div>
      </form>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CalendarDays, MapPin, User, FileText } from 'lucide-react'

export default function AgendarTasacionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    propertyAddress: '',
    scheduledDate: '',
    scheduledTime: '',
    assignedTo: '',
    notes: '',
  })

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    // TODO: Integrar con GHL API para crear oportunidad con custom field fecha_coordinacion_tasacion
    // Por ahora simula el guardado
    await new Promise(resolve => setTimeout(resolve, 1000))

    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push('/pipeline'), 2000)
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <div className="text-4xl mb-4">&#10003;</div>
            <h2 className="text-xl font-bold mb-2">Tasacion Agendada</h2>
            <p className="text-muted-foreground">Redirigiendo al pipeline...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agendar Tasacion</h1>
        <p className="text-muted-foreground">Programa una nueva tasacion para un prospecto</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                <Input
                  id="contactName"
                  value={form.contactName}
                  onChange={e => updateField('contactName', e.target.value)}
                  placeholder="Juan Perez"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Telefono *</Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  value={form.contactPhone}
                  onChange={e => updateField('contactPhone', e.target.value)}
                  placeholder="+54 11 1234-5678"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={e => updateField('contactEmail', e.target.value)}
                placeholder="juan@email.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5" />
              Propiedad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="propertyAddress">Direccion de la propiedad *</Label>
              <Input
                id="propertyAddress"
                value={form.propertyAddress}
                onChange={e => updateField('propertyAddress', e.target.value)}
                placeholder="Av. Corrientes 1234, CABA"
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" />
              Fecha y Hora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledDate">Fecha *</Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  value={form.scheduledDate}
                  onChange={e => updateField('scheduledDate', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledTime">Hora *</Label>
                <Input
                  id="scheduledTime"
                  type="time"
                  value={form.scheduledTime}
                  onChange={e => updateField('scheduledTime', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignedTo">Asesor asignado</Label>
              <Input
                id="assignedTo"
                value={form.assignedTo}
                onChange={e => updateField('assignedTo', e.target.value)}
                placeholder="Nombre del asesor"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Notas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Notas adicionales sobre la tasacion..."
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar Tasacion
          </Button>
        </div>
      </form>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CalendarDays, User, FileText, Tag, Home } from 'lucide-react'
import { leerJson } from '@/lib/crm/leer-json'

type TipoPropiedad = '' | 'departamento' | 'casa' | 'ph' | 'otro'

interface ProcesoPrecargado {
  contact_id: string | null
  origin: string | null
  property_address: string | null
  property_type: string | null
  property_type_other: string | null
  neighborhood: string | null
  rooms: number | null
  covered_area: number | null
  contacts: { full_name: string | null; phone: string | null; email: string | null } | null
}

interface ContactoPrecargado {
  contact: { full_name: string | null; phone: string | null; email: string | null }
}

// La etiqueta de siempre de cada origen (D9: con `?deal=` el origen se muestra fijo).
const ETIQUETA_ORIGEN: Record<string, string> = {
  embudo: 'Embudo',
  referido: 'Referido',
  historico: 'Histórico',
  clase_gratuita: 'Clase gratuita',
}

const TIPOS: TipoPropiedad[] = ['departamento', 'casa', 'ph', 'otro']
const aTipo = (v: string | null): TipoPropiedad => TIPOS.find((t) => t === v) ?? ''

/**
 * Formulario de "Coordinar tasación". Con `dealId` convierte esa solicitud (manda
 * `from_deal_id`; el origen se muestra fijo y no se envía: la conversión no lo toca).
 * Con `contactId` abre un proceso nuevo para esa persona (manda `contact_id`; el origen
 * se elige, no se precarga: un `clase_gratuita` rompería el email de "Tasación
 * agendada"). Sin ninguno de los dos, lo de siempre (crm-ficha-y-llamadas, D9).
 */
export function FormCoordinarTasacion({ dealId, contactId }: { dealId: string | null; contactId: string | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
  // Con `?deal=`: a qué persona volver y qué origen mostrar fijo.
  const [contactoDelProceso, setContactoDelProceso] = useState<string | null>(null)
  const [origenDelProceso, setOrigenDelProceso] = useState<string | null>(null)
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
    propertyType: '' as TipoPropiedad,
    propertyTypeOther: '',
    neighborhood: '',
    rooms: '' as string,
    coveredArea: '' as string,
  })

  useEffect(() => {
    fetch('/api/users/advisors')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setAdvisors(j.data || []))
      .catch((err) => console.error('[FormCoordinarTasacion] no se pudieron leer los asesores', err))
  }, [])

  useEffect(() => {
    if (!dealId) return
    let vigente = true
    fetch(`/api/deals/${encodeURIComponent(dealId)}`)
      .then(r => leerJson<{ data: ProcesoPrecargado }>(r))
      .then(r => {
        if (!vigente) return
        if (!r.ok) {
          setError(`No se pudo cargar el proceso: ${r.error}`)
          return
        }
        const d = r.data.data
        setContactoDelProceso(d.contact_id)
        setOrigenDelProceso(d.origin)
        // "Notas" arranca vacío a propósito: lo que se escriba se agrega a las del proceso.
        setForm(prev => ({
          ...prev,
          contactName: d.contacts?.full_name ?? '',
          contactPhone: d.contacts?.phone ?? '',
          contactEmail: d.contacts?.email ?? '',
          propertyAddress: d.property_address ?? '',
          propertyType: aTipo(d.property_type),
          propertyTypeOther: d.property_type_other ?? '',
          neighborhood: d.neighborhood ?? '',
          rooms: d.rooms != null ? String(d.rooms) : '',
          coveredArea: d.covered_area != null ? String(d.covered_area) : '',
        }))
      })
      .catch((err) => {
        console.error('[FormCoordinarTasacion] no se pudo cargar el proceso', err)
        if (vigente) setError('No se pudo cargar el proceso. Probá de nuevo.')
      })
    return () => { vigente = false }
  }, [dealId])

  useEffect(() => {
    if (dealId || !contactId) return
    let vigente = true
    fetch(`/api/contacts/${encodeURIComponent(contactId)}`)
      .then(r => leerJson<ContactoPrecargado>(r))
      .then(r => {
        if (!vigente) return
        if (!r.ok) {
          setError(`No se pudo cargar el contacto: ${r.error}`)
          return
        }
        const c = r.data.contact
        setForm(prev => ({
          ...prev,
          contactName: c.full_name ?? '',
          contactPhone: c.phone ?? '',
          contactEmail: c.email ?? '',
        }))
      })
      .catch((err) => {
        console.error('[FormCoordinarTasacion] no se pudo cargar el contacto', err)
        if (vigente) setError('No se pudo cargar el contacto. Probá de nuevo.')
      })
    return () => { vigente = false }
  }, [dealId, contactId])

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const cuerpo: Record<string, unknown> = {
      contact_name: form.contactName,
      contact_phone: form.contactPhone,
      contact_email: form.contactEmail,
      property_address: form.propertyAddress,
      scheduled_date: form.scheduledDate,
      scheduled_time: form.scheduledTime || null,
      assigned_to: form.assignedTo || null,
      notes: form.notes || null,
      property_type: form.propertyType,
      property_type_other: form.propertyType === 'otro' ? form.propertyTypeOther : null,
      neighborhood: form.neighborhood,
      rooms: form.rooms ? parseInt(form.rooms, 10) : null,
      covered_area: form.coveredArea ? parseFloat(form.coveredArea) : null,
    }
    if (dealId) cuerpo.from_deal_id = dealId
    else {
      cuerpo.origin = form.origin || null
      if (contactId) cuerpo.contact_id = contactId
    }

    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const r = await leerJson<{ contact_id?: string; warning?: string }>(res)
      if (!r.ok) {
        // Lo escrito queda en el formulario: un 409 ("El proceso ya cambió de etapa")
        // no tiene que obligar a cargar todo de nuevo.
        setError(r.error)
        return
      }
      const aviso = r.data.warning ?? null
      setWarning(aviso)
      setSuccess(true)
      const personaId = dealId ? contactoDelProceso ?? r.data.contact_id ?? null : contactId
      const destino = (dealId || contactId) && personaId ? `/contacts/${personaId}` : '/pipeline'
      // Con un aviso, más tiempo para leerlo antes de salir de la pantalla.
      setTimeout(() => router.push(destino), aviso ? 5000 : 1500)
    } catch (err) {
      console.error('[FormCoordinarTasacion] error al coordinar', err)
      setError(err instanceof Error ? err.message : 'Error al agendar')
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
            {warning && (
              <p role="status" className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {warning}
              </p>
            )}
            <p className="text-muted-foreground">
              {dealId || contactId ? 'Volviendo a la ficha...' : 'Redirigiendo al pipeline...'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 max-w-2xl mx-auto">
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
                <Label htmlFor="origin">{dealId ? 'Origen' : 'Origen *'}</Label>
                {dealId ? (
                  // Fijo: la conversión no cambia `deals.origin`, así que no se elige
                  // un dato que después no se guarda (D9).
                  <select
                    id="origin"
                    defaultValue="fijo"
                    disabled
                    className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm max-md:min-h-11"
                  >
                    <option value="fijo">
                      {origenDelProceso ? ETIQUETA_ORIGEN[origenDelProceso] ?? origenDelProceso : 'Sin origen'}
                    </option>
                  </select>
                ) : (
                  <select
                    id="origin"
                    value={form.origin}
                    onChange={e => updateField('origin', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11"
                    required
                  >
                    <option value="">Seleccionar origen...</option>
                    <option value="embudo">Embudo (Landing Page)</option>
                    <option value="referido">Referido</option>
                    <option value="historico">Historico</option>
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignedTo">Asesor asignado *</Label>
                <select
                  id="assignedTo"
                  value={form.assignedTo}
                  onChange={e => updateField('assignedTo', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11"
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
              <Label htmlFor="contactEmail">Email *</Label>
              <Input id="contactEmail" type="email" value={form.contactEmail} onChange={e => updateField('contactEmail', e.target.value)} placeholder="juan@email.com" required />
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
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11"
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
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-md:min-h-11"
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
                  inputMode="numeric"
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
              id="notes"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder={dealId ? 'Se agrega a las notas que ya tiene el proceso...' : 'Notas adicionales...'}
            />
          </CardContent>
        </Card>

        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

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

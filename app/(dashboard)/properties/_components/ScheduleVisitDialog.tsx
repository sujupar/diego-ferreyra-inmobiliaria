'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface Props {
  propertyId: string | null
  propertyAddress?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (visitId: string) => void
}

export function ScheduleVisitDialog({ propertyId, propertyAddress, open, onOpenChange, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    scheduled_at: '',
    notes: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!propertyId) return
    if (!form.client_name || !form.client_email || !form.scheduled_at) {
      toast.error('Completá nombre, email y fecha/hora')
      return
    }
    setSubmitting(true)
    try {
      const isoScheduledAt = new Date(form.scheduled_at).toISOString()
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          client_name: form.client_name,
          client_email: form.client_email,
          client_phone: form.client_phone || undefined,
          scheduled_at: isoScheduledAt,
          notes: form.notes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al agendar')
      toast.success('Visita agendada. Se envió email de confirmación al cliente.')
      onSuccess?.(json.data.id)
      onOpenChange(false)
      setForm({ client_name: '', client_email: '', client_phone: '', scheduled_at: '', notes: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al agendar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Agendar visita</DialogTitle>
        {propertyAddress && (
          <DialogDescription>Propiedad: <strong>{propertyAddress}</strong></DialogDescription>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client_name">Nombre del cliente</Label>
            <Input id="client_name" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_email">Email</Label>
            <Input id="client_email" type="email" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_phone">Teléfono</Label>
            <Input id="client_phone" value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduled_at">Fecha y hora</Label>
            <Input
              id="scheduled_at"
              type="datetime-local"
              value={form.scheduled_at}
              min={new Date().toISOString().slice(0, 16)}
              onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea id="notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Agendar y notificar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

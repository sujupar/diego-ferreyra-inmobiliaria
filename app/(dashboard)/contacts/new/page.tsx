'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, User } from 'lucide-react'

export default function NewContactPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', origin: '', assigned_to: '', notes: '',
  })

  useEffect(() => {
    fetch('/api/users/advisors')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setAdvisors(j.data || []))
      .catch(() => {})
  }, [])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          phone: form.phone || undefined,
          email: form.email || undefined,
          origin: form.origin || undefined,
          assigned_to: form.assigned_to || undefined,
          notes: form.notes || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Error')
      const { id } = await res.json()
      router.push(`/contacts/${id}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al crear contacto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo Contacto</h1>
        <p className="text-muted-foreground">Registrar un nuevo prospecto</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" />Datos del Contacto</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} required placeholder="Juan Perez" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Telefono</Label><Input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+54 11 1234-5678" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="juan@email.com" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Origen</Label>
                <select value={form.origin} onChange={e => update('origin', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Seleccionar...</option>
                  <option value="embudo">Embudo</option>
                  <option value="referido">Referido</option>
                  <option value="historico">Historico</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Asesor asignado</Label>
                <select value={form.assigned_to} onChange={e => update('assigned_to', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Sin asignar</option>
                  {advisors.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Notas sobre el contacto..." />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear Contacto
          </Button>
        </div>
      </form>
    </div>
  )
}

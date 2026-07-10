'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

const TYPE_OPTIONS = [
  { value: 'call', label: 'Llamada' },
  { value: 'email', label: 'Email' },
  { value: 'message', label: 'Mensaje' },
  { value: 'visit', label: 'Visita' },
  { value: 'document', label: 'Documentación' },
  { value: 'other', label: 'Otro' },
]

const ASSIGN_ROLES = ['admin', 'dueno', 'coordinador']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

interface AddTaskDialogProps {
  entity?: { kind: 'deal' | 'property' | 'appraisal' | 'contact'; id: string; label?: string }
  trigger?: React.ReactNode
  defaultAssignee?: string
  onCreated?: (taskId: string) => void
}

export function AddTaskDialog({ entity, trigger, defaultAssignee, onCreated }: AddTaskDialogProps) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState('call')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayIso())
  const [allDay, setAllDay] = useState(true)
  const [time, setTime] = useState('09:00')
  const [assignee, setAssignee] = useState(defaultAssignee ?? '')
  const [me, setMe] = useState<{ id: string; role: string } | null>(null)
  const [users, setUsers] = useState<{ id: string; full_name: string; role: string }[]>([])
  const [submitting, setSubmitting] = useState(false)

  const canAssignOthers = !!me && ASSIGN_ROLES.includes(me.role)

  useEffect(() => {
    if (!open) return
    fetch('/api/auth/me').then(r => r.json()).then(setMe).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open || !canAssignOthers) return
    fetch('/api/users/assignable')
      .then(r => r.json())
      .then(j => setUsers(Array.isArray(j.data) ? j.data : []))
      .catch(() => {})
  }, [open, canAssignOthers])

  function reset() {
    setChannel('call'); setTitle(''); setNote(''); setDate(todayIso())
    setAllDay(true); setTime('09:00'); setAssignee(defaultAssignee ?? '')
  }

  async function submit() {
    if (!title.trim()) { toast.error('Poné un título.'); return }
    if (date < todayIso()) { toast.error('La fecha no puede ser anterior a hoy.'); return }
    if (!allDay && !time) { toast.error('Indicá una hora o marcá "Todo el día".'); return }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        type: 'follow_up',
        title: title.trim(),
        description: note.trim() || undefined,
        channel,
        due_date: date,
        all_day: allDay,
        due_time: allDay ? null : time,
      }
      if (entity) body[`${entity.kind}_id`] = entity.id
      if (assignee) body.assigned_to = assignee

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.error || 'No se pudo crear la tarea.'); return }
      toast.success('Tarea agendada.')
      setOpen(false); reset()
      onCreated?.(data.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear la tarea.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Agregar tarea
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva tarea{entity?.label ? ` · ${entity.label}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select options={TYPE_OPTIONS} value={channel} onChange={e => setChannel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Llamar para coordinar visita" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Nota (opcional)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Detalle..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={date} min={todayIso()} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input type="time" value={time} disabled={allDay} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
            Todo el día
          </label>
          {canAssignOthers && (
            <div className="space-y-1.5">
              <Label>Asignar a</Label>
              <Select
                options={[{ value: '', label: 'Yo mismo' }, ...users.map(u => ({ value: u.id, label: u.full_name }))]}
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

# Sistema de Tareas Universal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cualquier usuario cree una tarea de seguimiento (tipo, fecha, hora) desde cualquier prospecto o de forma suelta, y que le quede en sus Pendientes.

**Architecture:** El backend ya existe (tabla `tasks`, `POST /api/tasks` con `follow_up`, página `/tasks`). Se amplía el set de "tipos", se extrae la validación/autorización a una función pura testeable, se extiende el POST, se agrega un endpoint de usuarios asignables, y se monta un componente `AddTaskDialog` reutilizable en 5 superficies.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (service-role), sonner (toast), primitivos UI propios (`Select` nativo, `Dialog` radix).

## Global Constraints

- **No romper NADA existente.** El modal "Seguimiento" del pipeline (`app/(dashboard)/pipeline/[id]/page.tsx`) NO se refactoriza y debe seguir funcionando idéntico (sigue mandando `channel ∈ {call,email,message}`).
- Commit author: `Sujupar <redstyle50@gmail.com>` (o el deploy de Netlify falla).
- Rama: `feature/universal-tasks`.
- Migraciones: el usuario las corre a mano en el SQL Editor de Supabase (el CLI no conecta).
- Cliente Supabase service-role solo en server; nunca en cliente.
- `type='follow_up'` es el único tipo que el cliente puede crear (los tipos de sistema se crean server-side).
- Set de tipos (columna `channel`): `call, email, message, visit, document, other`.
- Roles que pueden asignar a OTRO usuario: `admin`, `dueno`, `coordinador`. `asesor`/`abogado` solo se auto-asignan.

---

### Task 1: Migración aditiva — ampliar el CHECK de `channel`

**Files:**
- Create: `supabase/migrations/20260710000002_tasks_universal_channel.sql`

**Interfaces:**
- Produces: la columna `tasks.channel` acepta `{call,email,message,visit,document,other}`.

- [ ] **Step 1: Crear la migración**

```sql
-- =============================================================================
-- Migración: ampliar tasks.channel para el sistema de tareas universal.
-- Aditiva: los valores existentes (call/email/message) siguen válidos. El modal
-- de Seguimiento del pipeline no cambia. `channel` pasa a representar el "Tipo"
-- de tarea creada por el usuario (rotulado "Tipo" en la UI).
-- Correr en: Supabase Dashboard → SQL Editor.
-- =============================================================================
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_channel_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_channel_check
  CHECK (channel IS NULL OR channel IN ('call','email','message','visit','document','other'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260710000002_tasks_universal_channel.sql
git commit -m "feat(tareas): migración amplía tasks.channel a 6 tipos"
```

---

### Task 2: Validador puro de input de tarea (TDD)

Extraemos la validación + regla de autorización de asignación a una función PURA (sin Supabase), fácil de testear. El route la usará.

**Files:**
- Create: `lib/tasks/validate-task-input.ts`
- Test: `lib/tasks/validate-task-input.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TaskChannel = 'call'|'email'|'message'|'visit'|'document'|'other'
  interface RawTaskInput {
    type?: string; title?: unknown; description?: unknown; channel?: unknown;
    due_date?: unknown; due_time?: unknown; all_day?: unknown;
    deal_id?: unknown; property_id?: unknown; appraisal_id?: unknown; contact_id?: unknown;
    assigned_to?: unknown;
  }
  interface NormalizedTask {
    type: 'follow_up'; title: string; description: string | null; channel: TaskChannel;
    due_date: string; due_time: string | null; all_day: boolean;
    deal_id: string | null; property_id: string | null; appraisal_id: string | null; contact_id: string | null;
    assigned_to: string; created_by: string;
  }
  // role del creador para autorizar asignación a otro
  function validateTaskInput(
    raw: RawTaskInput, user: { id: string; role: string }, today: string
  ): { ok: true; value: NormalizedTask } | { ok: false; error: string; status: number }
  ```

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, it, expect } from 'vitest'
import { validateTaskInput } from './validate-task-input'

const USER = { id: 'u1', role: 'asesor' }
const ADMIN = { id: 'a1', role: 'admin' }
const TODAY = '2026-07-10'

function base() {
  return { type: 'follow_up', title: 'Llamar a Juan', channel: 'call', due_date: '2026-07-11', all_day: true }
}

describe('validateTaskInput', () => {
  it('acepta un follow_up mínimo y auto-asigna al creador', () => {
    const r = validateTaskInput(base(), USER, TODAY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.assigned_to).toBe('u1')
      expect(r.value.created_by).toBe('u1')
      expect(r.value.type).toBe('follow_up')
      expect(r.value.all_day).toBe(true)
      expect(r.value.due_time).toBeNull()
    }
  })

  it('rechaza título vacío', () => {
    const r = validateTaskInput({ ...base(), title: '  ' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('rechaza canal inválido', () => {
    const r = validateTaskInput({ ...base(), channel: 'carta' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('acepta los tipos nuevos (visit/document/other)', () => {
    for (const c of ['visit', 'document', 'other']) {
      expect(validateTaskInput({ ...base(), channel: c }, USER, TODAY).ok).toBe(true)
    }
  })

  it('rechaza fecha anterior a hoy', () => {
    const r = validateTaskInput({ ...base(), due_date: '2026-07-09' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('exige hora si no es all_day', () => {
    const r = validateTaskInput({ ...base(), all_day: false, due_time: '' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('normaliza due_time a null cuando all_day', () => {
    const r = validateTaskInput({ ...base(), all_day: true, due_time: '10:00' }, USER, TODAY)
    expect(r.ok && r.value.due_time).toBeNull()
  })

  it('conserva due_time cuando no es all_day', () => {
    const r = validateTaskInput({ ...base(), all_day: false, due_time: '10:30' }, USER, TODAY)
    expect(r.ok && r.value.due_time).toBe('10:30')
  })

  it('fuerza type=follow_up aunque el cliente mande otro', () => {
    const r = validateTaskInput({ ...base(), type: 'new_assignment' }, USER, TODAY)
    expect(r.ok && r.value.type).toBe('follow_up')
  })

  it('acepta a lo sumo una entidad', () => {
    const r = validateTaskInput({ ...base(), deal_id: 'd1', property_id: 'p1' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('mapea la entidad única', () => {
    const r = validateTaskInput({ ...base(), property_id: 'p1' }, USER, TODAY)
    expect(r.ok && r.value.property_id).toBe('p1')
    expect(r.ok && r.value.deal_id).toBeNull()
  })

  it('asesor NO puede asignar a otro usuario (403)', () => {
    const r = validateTaskInput({ ...base(), assigned_to: 'otro' }, USER, TODAY)
    expect(r).toMatchObject({ ok: false, status: 403 })
  })

  it('admin puede asignar a otro usuario', () => {
    const r = validateTaskInput({ ...base(), assigned_to: 'otro' }, ADMIN, TODAY)
    expect(r.ok && r.value.assigned_to).toBe('otro')
    expect(r.ok && r.value.created_by).toBe('a1')
  })

  it('asignarse a sí mismo explícito es válido para cualquier rol', () => {
    const r = validateTaskInput({ ...base(), assigned_to: 'u1' }, USER, TODAY)
    expect(r.ok && r.value.assigned_to).toBe('u1')
  })
})
```

- [ ] **Step 2: Correr los tests (deben fallar)**

Run: `npx vitest run lib/tasks/validate-task-input.test.ts`
Expected: FAIL ("Cannot find module './validate-task-input'").

- [ ] **Step 3: Implementar el validador**

```ts
export type TaskChannel = 'call' | 'email' | 'message' | 'visit' | 'document' | 'other'

const CHANNELS: TaskChannel[] = ['call', 'email', 'message', 'visit', 'document', 'other']
const ASSIGN_OTHERS_ROLES = ['admin', 'dueno', 'coordinador']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

export interface RawTaskInput {
  type?: string
  title?: unknown
  description?: unknown
  channel?: unknown
  due_date?: unknown
  due_time?: unknown
  all_day?: unknown
  deal_id?: unknown
  property_id?: unknown
  appraisal_id?: unknown
  contact_id?: unknown
  assigned_to?: unknown
}

export interface NormalizedTask {
  type: 'follow_up'
  title: string
  description: string | null
  channel: TaskChannel
  due_date: string
  due_time: string | null
  all_day: boolean
  deal_id: string | null
  property_id: string | null
  appraisal_id: string | null
  contact_id: string | null
  assigned_to: string
  created_by: string
}

type Result =
  | { ok: true; value: NormalizedTask }
  | { ok: false; error: string; status: number }

function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export function validateTaskInput(
  raw: RawTaskInput,
  user: { id: string; role: string },
  today: string,
): Result {
  const title = (asStr(raw.title) ?? '').trim()
  if (!title || title.length > 200) {
    return { ok: false, error: 'El título es obligatorio (máx. 200).', status: 400 }
  }

  const channel = asStr(raw.channel) as TaskChannel | null
  if (!channel || !CHANNELS.includes(channel)) {
    return { ok: false, error: 'Tipo de tarea inválido.', status: 400 }
  }

  const due_date = asStr(raw.due_date)
  if (!due_date || !DATE_RE.test(due_date)) {
    return { ok: false, error: 'Fecha requerida (YYYY-MM-DD).', status: 400 }
  }
  if (due_date < today) {
    return { ok: false, error: 'La fecha no puede ser anterior a hoy.', status: 400 }
  }

  const all_day = raw.all_day !== false
  let due_time: string | null = null
  if (!all_day) {
    const t = asStr(raw.due_time)
    if (!t || !TIME_RE.test(t)) {
      return { ok: false, error: 'Si no es todo el día, indicá una hora (HH:MM).', status: 400 }
    }
    due_time = t
  }

  // Entidad: a lo sumo una
  const entities = {
    deal_id: asStr(raw.deal_id),
    property_id: asStr(raw.property_id),
    appraisal_id: asStr(raw.appraisal_id),
    contact_id: asStr(raw.contact_id),
  }
  const present = Object.values(entities).filter((v) => v && v.length > 0)
  if (present.length > 1) {
    return { ok: false, error: 'Una tarea puede ligarse a una sola entidad.', status: 400 }
  }

  // Asignación
  let assigned_to = user.id
  const rawAssignee = asStr(raw.assigned_to)
  if (rawAssignee && rawAssignee !== user.id) {
    if (!ASSIGN_OTHERS_ROLES.includes(user.role)) {
      return { ok: false, error: 'No podés asignar tareas a otro usuario.', status: 403 }
    }
    assigned_to = rawAssignee
  }

  const description = asStr(raw.description)?.trim() || null

  return {
    ok: true,
    value: {
      type: 'follow_up',
      title,
      description,
      channel,
      due_date,
      due_time,
      all_day,
      deal_id: entities.deal_id || null,
      property_id: entities.property_id || null,
      appraisal_id: entities.appraisal_id || null,
      contact_id: entities.contact_id || null,
      assigned_to,
      created_by: user.id,
    },
  }
}
```

- [ ] **Step 4: Correr los tests (deben pasar)**

Run: `npx vitest run lib/tasks/validate-task-input.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/validate-task-input.ts lib/tasks/validate-task-input.test.ts
git commit -m "feat(tareas): validador puro de input de tarea + tests"
```

---

### Task 3: Extender `POST /api/tasks` + nuevo `GET /api/users/assignable`

**Files:**
- Modify: `app/api/tasks/route.ts` (POST)
- Create: `app/api/users/assignable/route.ts`

**Interfaces:**
- Consumes: `validateTaskInput` (Task 2); `requireAuth`; `getUser` (para role).
- Produces: `POST /api/tasks` acepta el body extendido; `GET /api/users/assignable` → `{ data: {id,full_name,role}[] }`.

- [ ] **Step 1: Reescribir el POST de `app/api/tasks/route.ts`**

Reemplazar la función `POST` entera por esta (mantener el `GET` como está y los imports existentes; agregar los nuevos):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getMyTasks, createTask } from '@/lib/supabase/tasks'
import { requireAuth } from '@/lib/auth/require-role'
import { getUser } from '@/lib/auth/get-user'
import { validateTaskInput } from '@/lib/tasks/validate-task-input'
import { createClient } from '@supabase/supabase-js'

// ... GET queda igual ...

export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const body = await request.json()
    const today = new Date().toISOString().slice(0, 10)
    const parsed = validateTaskInput(body, { id: user.id, role: user.profile.role }, today)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }

    // Si se asigna a otro usuario, verificar que exista y esté activo.
    if (parsed.value.assigned_to !== user.id) {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data: target } = await admin
        .from('profiles').select('id, is_active, role')
        .eq('id', parsed.value.assigned_to).maybeSingle()
      if (!target || target.is_active === false || target.role === 'abogado') {
        return NextResponse.json({ error: 'Usuario destinatario inválido.' }, { status: 400 })
      }
    }

    const id = await createTask(parsed.value)
    if (id === null) {
      return NextResponse.json({ success: true, skipped: true, reason: 'duplicate_pending_task' })
    }
    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
```

Nota: se elimina el bloque de validación follow_up inline previo (ahora vive en `validateTaskInput`). El `GET` no se toca.

- [ ] **Step 2: Crear `app/api/users/assignable/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET() {
  await requireAuth()
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    // Destinatarios válidos de tareas comerciales: staff activo, excluye abogado.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .in('role', ['admin', 'dueno', 'coordinador', 'asesor'])
      .order('full_name')
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (ignorar cualquier referencia stale de `.next/types`).

- [ ] **Step 4: Verificar que el flujo del pipeline sigue válido**

Confirmar que el body que manda el modal de Seguimiento del pipeline (`type:'follow_up', channel:'call', due_date, all_day, due_time, deal_id, title, description`) pasa `validateTaskInput` sin error. (Cubierto por los tests de Task 2: `base()` es exactamente esa forma.)

- [ ] **Step 5: Commit**

```bash
git add app/api/tasks/route.ts app/api/users/assignable/route.ts
git commit -m "feat(tareas): POST /api/tasks usa validador + GET /api/users/assignable"
```

---

### Task 4: Componente reutilizable `AddTaskDialog`

**Files:**
- Create: `components/tasks/AddTaskDialog.tsx`

**Interfaces:**
- Consumes: `POST /api/tasks`, `GET /api/users/assignable`, `GET /api/auth/me`.
- Produces:
  ```tsx
  interface AddTaskDialogProps {
    entity?: { kind: 'deal' | 'property' | 'appraisal' | 'contact'; id: string; label?: string }
    trigger?: React.ReactNode
    defaultAssignee?: string
    onCreated?: (taskId: string) => void
  }
  export function AddTaskDialog(props: AddTaskDialogProps): JSX.Element
  ```

- [ ] **Step 1: Implementar el componente**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. (Si `Textarea`/`Input` no existieran se vería acá — ambos existen en `components/ui/`.)

- [ ] **Step 3: Commit**

```bash
git add components/tasks/AddTaskDialog.tsx
git commit -m "feat(tareas): componente reutilizable AddTaskDialog"
```

---

### Task 5: Montar en las 5 superficies + labels/tareas sueltas en /tasks

**Files:**
- Modify: `app/(dashboard)/tasks/page.tsx` (labels nuevos, botón global, standalone)
- Modify: `app/(dashboard)/contacts/[id]/page.tsx`
- Modify: `app/(dashboard)/pipeline/[id]/page.tsx`
- Modify: `app/(dashboard)/properties/[id]/page.tsx`
- Modify: `app/(dashboard)/appraisals/[id]/page.tsx`

**Interfaces:**
- Consumes: `AddTaskDialog` (Task 4).

- [ ] **Step 1: Ampliar `CHANNEL_CONFIG` y manejar tareas sin entidad en `/tasks`**

En `app/(dashboard)/tasks/page.tsx`:
1. Ampliar el import de iconos: agregar `MapPin, FileText, Bell, Plus`.
2. Ampliar `CHANNEL_CONFIG`:

```tsx
const CHANNEL_CONFIG: Record<string, { icon: typeof Phone; label: string }> = {
  call: { icon: Phone, label: 'Llamada' },
  email: { icon: Mail, label: 'Correo' },
  message: { icon: MessageSquare, label: 'Mensaje' },
  visit: { icon: MapPin, label: 'Visita' },
  document: { icon: FileText, label: 'Documentación' },
  other: { icon: Bell, label: 'Otro' },
}
```

3. En el header (junto al `<h1>Pendientes</h1>`), agregar el botón global. Importar `AddTaskDialog` y renderizar:

```tsx
<AddTaskDialog
  onCreated={() => { if (userInfo?.id) { setFilter(f => f) /* trigger refetch */ } }}
  trigger={<Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva tarea</Button>}
/>
```

Para el refetch fiable, extraer la carga de tareas a una función `loadTasks()` y llamarla desde el `useEffect` y desde `onCreated`. Reemplazar el `useEffect` de carga por:

```tsx
const loadTasks = useCallback(() => {
  if (!userInfo?.id) return
  setLoading(true)
  const status = filter === 'all' ? '' : filter
  fetch(`/api/tasks?user_id=${userInfo.id}${status ? `&status=${status}` : ''}`)
    .then(r => r.json())
    .then(({ data }) => { /* ...sort existente... */ setTasks(sorted) })
    .catch(err => console.error(err))
    .finally(() => setLoading(false))
}, [userInfo, filter])
useEffect(() => { loadTasks() }, [loadTasks])
```

(Agregar `useCallback` al import de React.) Y `onCreated={loadTasks}`.

4. En el render de cada task, ocultar la flecha de link cuando no hay entidad:

```tsx
{getTaskLink(task) !== '#' && (
  <Link href={getTaskLink(task)}>
    <Button size="sm" variant={config.urgent ? 'default' : 'ghost'} ...>
      <ChevronRight className="h-4 w-4" />
    </Button>
  </Link>
)}
```

- [ ] **Step 2: Montar en `contacts/[id]`**

Importar `AddTaskDialog` y colocar el botón cerca del header/acciones del contacto. `data` tiene el contacto cargado; usar su id de la ruta (`params`). Ejemplo dentro del bloque de acciones:

```tsx
<AddTaskDialog entity={{ kind: 'contact', id: contactId, label: data?.contact?.full_name }} />
```

(Usar el id del contacto que la página ya tiene — el mismo que usa para `fetch(/api/contacts/${id})`.)

- [ ] **Step 3: Montar en `pipeline/[id]` (deal)**

Junto a las acciones del deal (NO tocar el modal de Seguimiento):

```tsx
<AddTaskDialog entity={{ kind: 'deal', id, label: deal?.contacts?.full_name }} />
```

- [ ] **Step 4: Montar en `properties/[id]`**

En el bloque de acciones de la propiedad (no visible para abogado si la página ya lo oculta; si no, es inofensivo):

```tsx
<AddTaskDialog entity={{ kind: 'property', id: propertyId, label: property?.address }} />
```

- [ ] **Step 5: Montar en `appraisals/[id]`**

```tsx
<AddTaskDialog entity={{ kind: 'appraisal', id, label: appraisal?.property_title }} />
```

- [ ] **Step 6: Typecheck + tests**

Run: `npx tsc --noEmit` (limpio, ignorar stale `.next/types`)
Run: `npx vitest run --exclude '**/video/**' --exclude '**/node_modules/**'`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/tasks/page.tsx" "app/(dashboard)/contacts/[id]/page.tsx" "app/(dashboard)/pipeline/[id]/page.tsx" "app/(dashboard)/properties/[id]/page.tsx" "app/(dashboard)/appraisals/[id]/page.tsx"
git commit -m "feat(tareas): montar AddTaskDialog en prospectos + Pendientes"
```

---

### Task 6: Verificación integral + agente de QA

**Files:** (ninguno nuevo)

- [ ] **Step 1: Build de producción en path ASCII** (el build local directo panica por el acento de la carpeta; usar worktree ASCII como en el hardening).

```bash
BUILDDIR="/private/tmp/asciibuild-tasks"; ORIG="$PWD"
git worktree add --detach "$BUILDDIR" HEAD
cd "$BUILDDIR" && npm install --legacy-peer-deps --no-audit --no-fund && npm run build
cd "$ORIG" && git worktree remove "$BUILDDIR" --force
```
Expected: build sin errores.

- [ ] **Step 2: Agente de QA** — dispatchar un subagente que verifique por lectura de código y (donde aplique) por ejecución:
  1. `validateTaskInput` cubre todos los casos (tests verdes).
  2. `POST /api/tasks`: cada superficie manda el body correcto; la entidad se mapea; la asignación a otro se autoriza server-side.
  3. El modal de Seguimiento del pipeline sigue mandando un body válido (no rompe).
  4. `/tasks` muestra los tipos nuevos y las tareas sin entidad sin flecha.
  5. Reportar pass/fail por caso.

- [ ] **Step 3: Avisar al usuario** que el QA pasó y que puede hacer la prueba real. Recordar correr la migración `20260710000002_tasks_universal_channel.sql` en el Dashboard antes de probar los tipos nuevos.

---

## Notas de no-ruptura (recordatorio)

- El modal de Seguimiento del pipeline NO se toca; su body sigue siendo válido bajo `validateTaskInput` (test `base()` lo prueba).
- La migración es aditiva; sin ella, los 3 tipos viejos siguen funcionando y los nuevos fallarían con error claro del CHECK (por eso correrla antes de probar tipos nuevos).
- `POST /api/tasks` conserva la semántica de idempotencia (`createTask` devuelve null en duplicado → `skipped`).

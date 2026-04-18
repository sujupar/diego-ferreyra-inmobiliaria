'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, CheckCircle, X, User, FileCheck, Home, Scale,
  AlertTriangle, ChevronRight, Bell
} from 'lucide-react'

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string; urgent?: boolean }> = {
  update_contact: { icon: User, color: 'bg-amber-100 text-amber-800', label: 'Actualizar Contacto' },
  new_assignment: { icon: FileCheck, color: 'bg-[color:var(--brass)] text-white', label: 'Tasación Coordinada', urgent: true },
  review_property: { icon: Scale, color: 'bg-purple-100 text-purple-800', label: 'Revisión Legal' },
  rejected_docs: { icon: AlertTriangle, color: 'bg-red-100 text-red-800', label: 'Docs Rechazados' },
}

interface Task {
  id: string
  type: string
  title: string
  description: string | null
  deal_id: string | null
  appraisal_id: string | null
  property_id: string | null
  contact_id: string | null
  status: string
  created_at: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getTaskLink(task: Task): string {
  if (task.deal_id) return `/pipeline/${task.deal_id}`
  if (task.property_id) return `/properties/${task.property_id}`
  if (task.appraisal_id) return `/appraisals/${task.appraisal_id}`
  if (task.contact_id) return `/contacts/${task.contact_id}`
  return '#'
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending')
  const [userInfo, setUserInfo] = useState<{ id: string } | null>(null)
  const [completing, setCompleting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {})
  }, [])

  useEffect(() => {
    if (!userInfo?.id) return
    setLoading(true)
    const status = filter === 'all' ? '' : filter
    fetch(`/api/tasks?user_id=${userInfo.id}${status ? `&status=${status}` : ''}`)
      .then(r => r.json())
      .then(({ data }) => {
        const sorted = (data || []).slice().sort((a: Task, b: Task) => {
          const aUrgent = a.type === 'new_assignment' ? 1 : 0
          const bUrgent = b.type === 'new_assignment' ? 1 : 0
          return bUrgent - aUrgent
        })
        setTasks(sorted)
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [userInfo, filter])

  async function handleAction(taskId: string, action: 'complete' | 'dismiss') {
    setCompleting(taskId)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch { alert('Error') }
    finally { setCompleting(null) }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Hoy · Bandeja</p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="display text-4xl">Pendientes</h1>
          <p className="text-sm text-muted-foreground tabular-n">
            {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}{filter === 'pending' ? ` pendiente${tasks.length !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant={filter === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('pending')}>Pendientes</Button>
        <Button variant={filter === 'completed' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('completed')}>Completadas</Button>
        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>Todas</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="display text-2xl">Todo al día</h3>
            <p className="text-sm text-muted-foreground">No hay tareas pendientes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const config = TYPE_CONFIG[task.type] || { icon: Bell, color: 'bg-gray-100 text-gray-800', label: task.type }
            const Icon = config.icon
            const link = getTaskLink(task)

            return (
              <Card
                key={task.id}
                className={`transition-all ${config.urgent
                  ? 'border-[color:var(--brass)]/40 shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--brass)_30%,transparent)] bg-[color:var(--brass-soft)]/30 hover:shadow-md'
                  : 'hover:bg-muted/30'}`}
              >
                <CardContent className="flex items-center gap-4 py-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${config.color} ${config.urgent ? 'ring-1 ring-inset ring-white/30' : ''}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`font-medium ${config.urgent ? 'text-foreground' : ''}`}>{task.title}</span>
                      <span className="eyebrow">{config.label}</span>
                      {config.urgent && (
                        <span className="eyebrow text-[color:var(--brass)] border-l border-[color:var(--brass)]/30 pl-2">
                          Acción Requerida
                        </span>
                      )}
                    </div>
                    {task.description && <p className="text-sm text-muted-foreground truncate">{task.description}</p>}
                    <p className="tabular-n text-[11px] text-muted-foreground mt-0.5">{formatDate(task.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.status === 'pending' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleAction(task.id, 'complete')} disabled={completing === task.id}>
                          {completing === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleAction(task.id, 'dismiss')} disabled={completing === task.id}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Link href={link}>
                      <Button
                        size="sm"
                        variant={config.urgent ? 'default' : 'ghost'}
                        className={config.urgent ? 'bg-[color:var(--brass)] text-white hover:bg-[color:var(--brass)]/90' : ''}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, User, Phone, Mail, FileCheck, Home, Calendar, Tag, Briefcase, Pencil } from 'lucide-react'
import { ContactEditor } from '@/components/contacts/ContactEditor'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(v: number, c: string = 'USD') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c === 'ARS' ? 'ARS' : 'USD', minimumFractionDigits: 0 }).format(v)
}

const ORIGIN_LABELS: Record<string, string> = { embudo: 'Embudo', referido: 'Referido', historico: 'Historico', tasacion: 'Tasacion' }

const STAGE_LABELS: Record<string, string> = {
  scheduled: 'Coordinada', visited: 'Visita Realizada',
  appraisal_sent: 'Tasación Entregada', followup: 'En Seguimiento',
  captured: 'Captada', lost: 'Descartado',
}
const STAGE_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500', visited: 'bg-amber-500',
  appraisal_sent: 'bg-purple-500', followup: 'bg-orange-500',
  captured: 'bg-green-500', lost: 'bg-red-500',
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)

  function loadData() {
    setLoading(true)
    fetch(`/api/contacts/${id}`)
      .then(r => r.json())
      .then(setData)
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Si llegamos con ?edit=1 (típicamente desde la pestaña de tareas), abrimos el editor.
  useEffect(() => {
    if (searchParams.get('edit') === '1') setEditorOpen(true)
  }, [searchParams])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!data?.contact) return <div className="text-center py-20"><p>Contacto no encontrado</p></div>

  const { contact, appraisals, properties, scheduled, deals } = data

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)} className="gap-2">
          <Pencil className="h-4 w-4" /> Editar Contacto
        </Button>
      </div>

      {/* Contact header */}
      <Card>
        <CardContent className="flex items-center gap-4 py-6">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{contact.full_name}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              {contact.phone && <span className="flex items-center gap-1"><Phone className="h-4 w-4" />{contact.phone}</span>}
              {contact.email && <span className="flex items-center gap-1"><Mail className="h-4 w-4" />{contact.email}</span>}
              {contact.origin && <Badge variant="secondary"><Tag className="h-3 w-3 mr-1" />{ORIGIN_LABELS[contact.origin]}</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      <ContactEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        contactId={contact.id}
        onSaved={() => loadData()}
      />

      {/* Timeline */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Historial del Contacto</h2>

        {/* Scheduled appraisals */}
        {scheduled.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-5 w-5" />Tasaciones Coordinadas ({scheduled.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {scheduled.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{s.property_address}</p>
                    <p className="text-xs text-muted-foreground">Coordinada: {formatDate(s.scheduled_date)}</p>
                  </div>
                  <Badge variant={s.status === 'completed' ? 'default' : s.status === 'cancelled' ? 'destructive' : 'secondary'}>
                    {s.status === 'completed' ? 'Completada' : s.status === 'cancelled' ? 'Cancelada' : 'Coordinada'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Deals / Procesos Comerciales */}
        {deals?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-5 w-5" />Procesos Comerciales ({deals.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {deals.map((d: any) => (
                <Link key={d.id} href={`/pipeline/${d.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                    <div>
                      <p className="text-sm font-medium">{d.property_address}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(d.created_at)}
                        {d.profiles?.full_name && ` · Asesor: ${d.profiles.full_name}`}
                      </p>
                    </div>
                    <Badge className={`text-white text-xs ${STAGE_COLORS[d.stage] || 'bg-gray-400'}`}>
                      {STAGE_LABELS[d.stage] || d.stage}
                    </Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Appraisals */}
        {appraisals.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileCheck className="h-5 w-5" />Tasaciones ({appraisals.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {appraisals.map((a: any) => (
                <Link key={a.id} href={`/appraisals/${a.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                    <div>
                      <p className="text-sm font-medium">{a.property_title || a.property_location}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(a.publication_price, a.currency)}</span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Properties */}
        {properties.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Home className="h-5 w-5" />Propiedades ({properties.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {properties.map((p: any) => (
                <Link key={p.id} href={`/properties/${p.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                    <div>
                      <p className="text-sm font-medium">{p.address}</p>
                      <p className="text-xs text-muted-foreground">{p.neighborhood} — {formatDate(p.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{p.status}</Badge>
                      <span className="text-sm font-medium">{formatCurrency(p.asking_price, p.currency)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {scheduled.length === 0 && appraisals.length === 0 && properties.length === 0 && (!deals || deals.length === 0) && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No hay actividad registrada para este contacto.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

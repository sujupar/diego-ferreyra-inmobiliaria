'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, User, Phone, Mail, FileCheck, Home, Calendar, Tag } from 'lucide-react'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(v: number, c: string = 'USD') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c === 'ARS' ? 'ARS' : 'USD', minimumFractionDigits: 0 }).format(v)
}

const ORIGIN_LABELS: Record<string, string> = { embudo: 'Embudo', referido: 'Referido', historico: 'Historico', tasacion: 'Tasacion' }

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/contacts/${id}`)
      .then(r => r.json())
      .then(setData)
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!data?.contact) return <div className="text-center py-20"><p>Contacto no encontrado</p></div>

  const { contact, appraisals, properties, scheduled } = data

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Volver
      </Button>

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

      {/* Timeline */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Historial del Contacto</h2>

        {/* Scheduled appraisals */}
        {scheduled.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-5 w-5" />Tasaciones Agendadas ({scheduled.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {scheduled.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{s.property_address}</p>
                    <p className="text-xs text-muted-foreground">Agendada: {formatDate(s.scheduled_date)}</p>
                  </div>
                  <Badge variant={s.status === 'completed' ? 'default' : s.status === 'cancelled' ? 'destructive' : 'secondary'}>
                    {s.status === 'completed' ? 'Completada' : s.status === 'cancelled' ? 'Cancelada' : 'Agendada'}
                  </Badge>
                </div>
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

        {scheduled.length === 0 && appraisals.length === 0 && properties.length === 0 && (
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

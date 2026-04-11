'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, ArrowLeft, User, MapPin, Calendar, Phone, Mail,
  ChevronRight, FileCheck, Home, Eye, MessageSquare, XCircle, Tag
} from 'lucide-react'

const STAGES = [
  { key: 'scheduled', label: 'Agendada', color: 'bg-blue-500', next: 'visited', nextLabel: 'Marcar Visita Realizada', nextIcon: Eye },
  { key: 'visited', label: 'Visita Realizada', color: 'bg-amber-500', next: 'appraisal_sent', nextLabel: 'Crear Tasación', nextIcon: FileCheck, isLink: true },
  { key: 'appraisal_sent', label: 'Tasación Entregada', color: 'bg-purple-500', next: 'followup', nextLabel: 'Marcar en Seguimiento', nextIcon: MessageSquare },
  { key: 'followup', label: 'En Seguimiento', color: 'bg-orange-500', next: 'captured', nextLabel: 'Captar Propiedad', nextIcon: Home, isLink: true },
  { key: 'captured', label: 'Captada', color: 'bg-green-500' },
  { key: 'lost', label: 'Perdido', color: 'bg-red-500' },
]

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const ORIGIN_LABELS: Record<string, string> = { embudo: 'Embudo', referido: 'Referido', historico: 'Historico' }

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [deal, setDeal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [notes, setNotes] = useState('')

  async function fetchDeal() {
    try {
      const res = await fetch(`/api/deals/${id}`)
      if (res.ok) {
        const { data } = await res.json()
        setDeal(data)
        setNotes(data.notes || '')
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchDeal() }, [id])

  async function handleAdvance(nextStage: string) {
    setAdvancing(true)
    try {
      await fetch(`/api/deals/${id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: nextStage, notes }),
      })
      await fetchDeal()
    } catch (err) { alert('Error al avanzar') }
    finally { setAdvancing(false) }
  }

  async function handleLost() {
    if (!confirm('Marcar como perdido?')) return
    setAdvancing(true)
    try {
      await fetch(`/api/deals/${id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'lost', notes }),
      })
      await fetchDeal()
    } catch (err) { alert('Error') }
    finally { setAdvancing(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!deal) return <div className="text-center py-20">Proceso no encontrado</div>

  const currentStage = STAGES.find(s => s.key === deal.stage)
  const contact = deal.contacts || {}

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => router.push('/pipeline')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Pipeline
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{contact.full_name || 'Sin nombre'}</h1>
          <p className="text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-4 w-4" />{deal.property_address}</p>
        </div>
        <Badge className={`text-white text-sm ${currentStage?.color || 'bg-gray-400'}`}>{currentStage?.label || deal.stage}</Badge>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {STAGES.filter(s => s.key !== 'lost').map((s, i) => {
              const stageIdx = STAGES.findIndex(x => x.key === deal.stage)
              const thisIdx = STAGES.findIndex(x => x.key === s.key)
              const isPast = thisIdx < stageIdx
              const isCurrent = s.key === deal.stage
              return (
                <div key={s.key} className="flex items-center gap-1">
                  <div className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${isCurrent ? `${s.color} text-white` : isPast ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>
                    {s.label}
                  </div>
                  {i < 4 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Contact info */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" />Contacto</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Nombre:</span><span className="font-medium">{contact.full_name}</span>
            {contact.phone && <><span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" />Teléfono:</span><span>{contact.phone}</span></>}
            {contact.email && <><span className="text-muted-foreground flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Email:</span><span>{contact.email}</span></>}
            {deal.origin && <><span className="text-muted-foreground flex items-center gap-1"><Tag className="h-3.5 w-3.5" />Origen:</span><span>{ORIGIN_LABELS[deal.origin] || deal.origin}</span></>}
            {deal.scheduled_date && <><span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Fecha agendada:</span><span>{deal.scheduled_date}{deal.scheduled_time ? ` ${deal.scheduled_time}` : ''}</span></>}
            {deal.profiles && <><span className="text-muted-foreground">Asesor:</span><span>{deal.profiles.full_name}</span></>}
          </div>
        </CardContent>
      </Card>

      {/* Linked appraisal */}
      {deal.appraisal_id && (
        <Link href={`/appraisals/${deal.appraisal_id}`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 py-4">
              <FileCheck className="h-5 w-5 text-purple-600" />
              <span className="font-medium">Ver Tasación Generada</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Linked property */}
      {deal.property_id && (
        <Link href={`/properties/${deal.property_id}`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 py-4">
              <Home className="h-5 w-5 text-green-600" />
              <span className="font-medium">Ver Propiedad Captada</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Notes */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Notas</CardTitle></CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Agregar notas sobre este proceso..."
          />
        </CardContent>
      </Card>

      {/* Action buttons */}
      {deal.stage !== 'captured' && deal.stage !== 'lost' && (
        <div className="flex gap-3 flex-wrap">
          {currentStage?.next && !currentStage.isLink && (
            <Button onClick={() => handleAdvance(currentStage.next!)} disabled={advancing} className="flex-1">
              {advancing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : currentStage.nextIcon && <currentStage.nextIcon className="h-4 w-4 mr-1" />}
              {currentStage.nextLabel}
            </Button>
          )}

          {deal.stage === 'visited' && !deal.appraisal_id && (
            <Link href={`/appraisal/new?dealId=${deal.id}`} className="flex-1">
              <Button className="w-full"><FileCheck className="h-4 w-4 mr-1" /> Crear Tasación</Button>
            </Link>
          )}

          {deal.stage === 'followup' && !deal.property_id && (
            <Link href={`/properties/new?dealId=${deal.id}`} className="flex-1">
              <Button className="w-full"><Home className="h-4 w-4 mr-1" /> Captar Propiedad</Button>
            </Link>
          )}

          <Button variant="destructive" size="sm" onClick={handleLost} disabled={advancing}>
            <XCircle className="h-4 w-4 mr-1" /> Marcar Perdido
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Creado: {formatDate(deal.created_at)} | Última actualización: {formatDate(deal.stage_changed_at || deal.updated_at)}
      </p>
    </div>
  )
}

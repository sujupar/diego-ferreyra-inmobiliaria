'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, ArrowLeft, User, MapPin, Calendar, Phone, Mail,
  ChevronRight, FileCheck, Home, Eye, MessageSquare, XCircle, Tag,
  Edit2, Send, Mic, MicOff, Square, UserCog, Clock, Megaphone, ExternalLink
} from 'lucide-react'

type FollowUpChannel = 'call' | 'email' | 'message'
const CHANNEL_LABEL: Record<FollowUpChannel, string> = {
  call: 'Llamada',
  email: 'Correo',
  message: 'Mensaje',
}
const todayIsoDate = () => new Date().toISOString().slice(0, 10)
import { ContactEditor } from '@/components/contacts/ContactEditor'

const VisitDataForm = dynamic(
  () => import('@/components/pipeline/VisitDataForm').then(m => ({ default: m.VisitDataForm })),
  {
    ssr: false,
    loading: () => <Loader2 className="h-6 w-6 animate-spin mx-auto" />,
  }
)

const STAGES = [
  { key: 'clase_gratuita', label: 'Clase Gratuita', color: 'bg-cyan-500' },
  { key: 'request', label: 'Solicitud', color: 'bg-sky-500' },
  { key: 'scheduled', label: 'Coordinada', color: 'bg-blue-500' },
  { key: 'not_visited', label: 'No Realizada', color: 'bg-rose-400' },
  { key: 'visited', label: 'Visita Realizada', color: 'bg-amber-500' },
  { key: 'appraisal_sent', label: 'Tasación Entregada', color: 'bg-purple-500' },
  { key: 'followup', label: 'En Seguimiento', color: 'bg-orange-500' },
  { key: 'captured', label: 'Captada', color: 'bg-green-500' },
  { key: 'lost', label: 'Descartado', color: 'bg-red-500' },
]

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const ORIGIN_LABELS: Record<string, string> = { embudo: 'Embudo', referido: 'Referido', historico: 'Historico' }
const PLATFORM_LABELS: Record<string, string> = { fb: 'Facebook', ig: 'Instagram', msg: 'Messenger', an: 'Audience Network', facebook: 'Facebook', instagram: 'Instagram' }

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [deal, setDeal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [notes, setNotes] = useState('')
  const [contactEditorOpen, setContactEditorOpen] = useState(false)

  // Followup modal
  const [showFollowupModal, setShowFollowupModal] = useState(false)
  const [followupNotes, setFollowupNotes] = useState('')
  const [followupChannel, setFollowupChannel] = useState<FollowUpChannel>('call')
  const [followupDate, setFollowupDate] = useState<string>(todayIsoDate())
  const [followupAllDay, setFollowupAllDay] = useState<boolean>(true)
  const [followupTime, setFollowupTime] = useState<string>('09:00')

  // Visit modal
  const [showVisitModal, setShowVisitModal] = useState(false)

  // Reschedule modal — permite editar fecha/hora de una tasación ya coordinada.
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState<string>('')
  const [scheduleTime, setScheduleTime] = useState<string>('')
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Audio transcription
  const [isRecording, setIsRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recognitionRef = useRef<any>(null)

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

  // Auto-abre el editor cuando llegamos con ?editContact=1 (desde tasks).
  useEffect(() => {
    if (searchParams.get('editContact') === '1') setContactEditorOpen(true)
  }, [searchParams])

  async function handleAdvance(nextStage: string, extraNotes?: string) {
    setAdvancing(true)
    try {
      await fetch(`/api/deals/${id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: nextStage, notes: extraNotes || notes }),
      })
      await fetchDeal()
    } catch (err) { alert('Error al avanzar') }
    finally { setAdvancing(false) }
  }

  async function handleLost() {
    if (!confirm('¿Descartar este proceso?')) return
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

  function openScheduleModal() {
    setScheduleDate(deal?.scheduled_date || '')
    setScheduleTime(deal?.scheduled_time ? String(deal.scheduled_time).slice(0, 5) : '')
    setShowScheduleModal(true)
  }

  async function handleSaveSchedule() {
    if (!scheduleDate) {
      toast.error('La fecha es obligatoria.')
      return
    }
    setSavingSchedule(true)
    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_date: scheduleDate,
          scheduled_time: scheduleTime || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo actualizar la fecha.')
        return
      }
      toast.success('Fecha y hora actualizadas.')
      setShowScheduleModal(false)
      await fetchDeal()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar la fecha.')
    } finally {
      setSavingSchedule(false)
    }
  }

  // Save notes independently
  async function handleSaveNotes() {
    try {
      await fetch(`/api/deals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
    } catch (err) { console.error(err) }
  }

  // Followup submission: 1) crea task con fecha + canal, 2) avanza stage a followup
  // preservando el historial en deals.notes.
  async function handleFollowupSubmit() {
    if (!followupNotes.trim()) {
      toast.error('Describí el seguimiento antes de continuar.')
      return
    }
    if (followupDate < todayIsoDate()) {
      toast.error('La fecha no puede ser anterior a hoy.')
      return
    }
    if (!followupAllDay && !followupTime) {
      toast.error('Indicá una hora o marcá "Todo el día".')
      return
    }

    setAdvancing(true)
    const channelLabel = CHANNEL_LABEL[followupChannel]
    const contactName = deal?.contacts?.full_name || 'sin contacto'
    const dateLabel = new Date(followupDate + 'T00:00:00').toLocaleDateString('es-AR')
    const timeLabel = followupAllDay ? 'todo el día' : followupTime

    try {
      const taskRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'follow_up',
          title: `Seguimiento ${channelLabel.toLowerCase()}: ${contactName}`,
          description: followupNotes.trim(),
          deal_id: id,
          channel: followupChannel,
          due_date: followupDate,
          all_day: followupAllDay,
          due_time: followupAllDay ? null : followupTime,
        }),
      })
      const taskData = await taskRes.json().catch(() => ({}))
      if (!taskRes.ok) {
        toast.error(taskData?.error || 'No se pudo guardar el seguimiento.')
        setAdvancing(false)
        return
      }

      // Preserve historial en notes
      const header = `--- Seguimiento ${channelLabel} (${dateLabel} ${timeLabel}) ---`
      const combinedNotes = notes ? `${notes}\n\n${header}\n${followupNotes.trim()}` : `${header}\n${followupNotes.trim()}`
      await handleAdvance('followup', combinedNotes)
      toast.success(`Seguimiento agendado para el ${dateLabel}`)
      setShowFollowupModal(false)
      setFollowupNotes('')
      setFollowupChannel('call')
      setFollowupDate(todayIsoDate())
      setFollowupAllDay(true)
      setFollowupTime('09:00')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el seguimiento.')
    } finally {
      setAdvancing(false)
    }
  }

  // Speech-to-text
  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Tu navegador no soporta transcripción de voz. Usa Chrome o Edge.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      let interimTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' '
        } else {
          interimTranscript = transcript
        }
      }
      if (finalTranscript) {
        setFollowupNotes(prev => prev + finalTranscript)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Proceso Nº {String(deal.id).slice(-6).toUpperCase()}</p>
          <h1 className="display text-3xl">{contact.full_name || 'Sin nombre'}</h1>
          <p className="text-muted-foreground flex items-center gap-1 text-sm"><MapPin className="h-4 w-4" />{deal.property_address}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="eyebrow">Etapa Actual</span>
          <Badge className={`text-white text-xs ${currentStage?.color || 'bg-gray-400'}`}>{currentStage?.label || deal.stage}</Badge>
        </div>
      </div>

      {/* Progress bar — solo muestra el flow lineal aplicable a este deal.
          Clase Gratuita solo aparece si el deal vino por ese origen.
          Comprador es una rama separada y reemplaza al flow normal. */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(() => {
              const cameFromClase = deal.origin === 'clase_gratuita' || deal.stage === 'clase_gratuita'
              const isComprador = deal.stage === 'comprador'
              const flowStages = isComprador
                ? STAGES.filter(s => s.key === 'comprador')
                : STAGES.filter(s =>
                    s.key !== 'lost' &&
                    s.key !== 'not_visited' &&
                    s.key !== 'comprador' &&
                    (s.key !== 'clase_gratuita' || cameFromClase),
                  )
              const stageIdx = flowStages.findIndex(x => x.key === deal.stage)
              return flowStages.map((s, i) => {
                const isPast = i < stageIdx
                const isCurrent = s.key === deal.stage
                return (
                  <div key={s.key} className="flex items-center gap-1">
                    <div className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${isCurrent ? `${s.color} text-white` : isPast ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>
                      {s.label}
                    </div>
                    {i < flowStages.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                  </div>
                )
              })
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Contact info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" />Contacto</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setContactEditorOpen(true)} className="gap-1.5">
            <UserCog className="h-3.5 w-3.5" />
            {deal.contact_id ? 'Editar' : 'Asignar'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Nombre:</span><span className="font-medium">{contact.full_name}</span>
            {contact.phone && <><span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" />Teléfono:</span><span>{contact.phone}</span></>}
            {contact.email && <><span className="text-muted-foreground flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Email:</span><span>{contact.email}</span></>}
            {deal.origin && <><span className="text-muted-foreground flex items-center gap-1"><Tag className="h-3.5 w-3.5" />Origen:</span><span>{ORIGIN_LABELS[deal.origin] || deal.origin}</span></>}
            {deal.meta_campaign_name && <><span className="text-muted-foreground flex items-center gap-1"><Megaphone className="h-3.5 w-3.5" />Campaña:</span><span className="font-medium">{deal.meta_campaign_name}</span></>}
            {deal.meta_adset_name && <><span className="text-muted-foreground">Conjunto:</span><span>{deal.meta_adset_name}</span></>}
            {deal.meta_ad_name && <><span className="text-muted-foreground">Anuncio:</span><span>{deal.meta_ad_id ? <a href={`https://www.facebook.com/adsmanager/manage/ads?selected_ad_ids=${deal.meta_ad_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{deal.meta_ad_name}<ExternalLink className="h-3 w-3" /></a> : deal.meta_ad_name}</span></>}
            {deal.meta_site_source && <><span className="text-muted-foreground">Plataforma:</span><span>{PLATFORM_LABELS[deal.meta_site_source] || deal.meta_site_source}{deal.meta_placement ? ` · ${deal.meta_placement}` : ''}</span></>}
            {deal.scheduled_date && (
              <>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />Fecha agendada:
                </span>
                <span className="flex items-center gap-2">
                  <span>{deal.scheduled_date}{deal.scheduled_time ? ` ${String(deal.scheduled_time).slice(0, 5)}` : ''}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={openScheduleModal}
                    className="h-6 px-2 text-xs gap-1"
                    aria-label="Editar fecha y hora"
                  >
                    <Edit2 className="h-3 w-3" />
                    Editar
                  </Button>
                </span>
              </>
            )}
            {deal.profiles && <><span className="text-muted-foreground">Asesor:</span><span>{deal.profiles.full_name}</span></>}
          </div>
        </CardContent>
      </Card>

      <ContactEditor
        open={contactEditorOpen}
        onOpenChange={setContactEditorOpen}
        contactId={deal.contact_id}
        dealId={deal.id}
        initial={{ full_name: contact?.full_name || deal.property_address || '' }}
        onSaved={() => fetchDeal()}
      />

      {/* Propiedad */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Home className="h-5 w-5" />Propiedad</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Dirección:</span><span className="font-medium">{deal.property_address}</span>
            {deal.property_type && (
              <>
                <span className="text-muted-foreground">Tipo:</span>
                <span className="capitalize">{deal.property_type === 'otro' ? deal.property_type_other : deal.property_type}</span>
              </>
            )}
            {deal.neighborhood && <><span className="text-muted-foreground">Barrio:</span><span>{deal.neighborhood}</span></>}
            {deal.rooms && <><span className="text-muted-foreground">Ambientes:</span><span>{deal.rooms}</span></>}
            {deal.covered_area && <><span className="text-muted-foreground">M² cubiertos:</span><span>{deal.covered_area} m²</span></>}
          </div>
        </CardContent>
      </Card>

      {/* Linked appraisal — always show if exists */}
      {deal.appraisal_id && (
        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-3">
              <FileCheck className="h-5 w-5 text-purple-600" />
              <span className="font-medium text-purple-900 dark:text-purple-100">Tasación Generada</span>
            </div>
            <div className="flex gap-2">
              <Link href={`/appraisals/${deal.appraisal_id}`} className="flex-1">
                <Button variant="outline" className="w-full"><Eye className="h-4 w-4 mr-1" />Ver Tasación</Button>
              </Link>
              <Link href={`/appraisal/new?editId=${deal.appraisal_id}`} className="flex-1">
                <Button variant="outline" className="w-full"><Edit2 className="h-4 w-4 mr-1" />Editar Tasación</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked property */}
      {deal.property_id && (
        <Link href={`/properties/${deal.property_id}`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer border-green-200 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="flex items-center gap-3 py-4">
              <Home className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-900 dark:text-green-100">Ver Propiedad Captada</span>
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
            onBlur={handleSaveNotes}
            placeholder="Agregar notas sobre este proceso..."
          />
        </CardContent>
      </Card>

      {/* === STAGE-SPECIFIC ACTION BUTTONS === */}
      {deal.stage !== 'captured' && deal.stage !== 'lost' && (
        <Card className="border-2">
          <CardHeader><CardTitle className="text-lg">Acciones</CardTitle></CardHeader>
          <CardContent className="space-y-3">

            {/* SCHEDULED: Mark visit done or not done */}
            {deal.stage === 'scheduled' && (
              <div className="space-y-2">
                <Button
                  onClick={() => setShowVisitModal(true)}
                  disabled={advancing}
                  className="w-full bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90"
                  size="lg"
                >
                  {advancing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  Marcar Visita Realizada
                </Button>
                <Button onClick={() => handleAdvance('not_visited')} disabled={advancing} variant="outline" className="w-full" size="lg">
                  No Se Realizó la Visita
                </Button>
              </div>
            )}

            {/* NOT_VISITED: Reschedule or mark lost */}
            {deal.stage === 'not_visited' && (
              <div className="space-y-2">
                <Button
                  onClick={() => handleAdvance('scheduled')}
                  disabled={advancing}
                  className="w-full bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90"
                  size="lg"
                >
                  Reagendar Visita
                </Button>
              </div>
            )}

            {/* VISITED: Create or view tasación + mark as delivered */}
            {deal.stage === 'visited' && (
              <>
                {!deal.appraisal_id ? (
                  <Link href={`/appraisal/new?dealId=${deal.id}`} className="block">
                    <Button className="w-full bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90" size="lg">
                      <FileCheck className="h-4 w-4 mr-2" />Crear Tasación
                    </Button>
                  </Link>
                ) : (
                  <Button
                    onClick={() => handleAdvance('appraisal_sent')}
                    disabled={advancing}
                    className="w-full bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90"
                    size="lg"
                  >
                    {advancing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Marcar Tasación Entregada
                  </Button>
                )}
              </>
            )}

            {/* APPRAISAL_SENT: Two clear options */}
            {deal.stage === 'appraisal_sent' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={() => setShowFollowupModal(true)}
                  disabled={advancing}
                  variant="outline"
                  size="lg"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Seguimiento
                </Button>
                <Link href={`/properties/new?dealId=${deal.id}`}>
                  <Button size="lg" className="w-full bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90">
                    <Home className="h-4 w-4 mr-2" />
                    Captar Propiedad
                  </Button>
                </Link>
              </div>
            )}

            {/* FOLLOWUP: Same two options */}
            {deal.stage === 'followup' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={() => setShowFollowupModal(true)}
                  disabled={advancing}
                  variant="outline"
                  size="lg"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Agregar Seguimiento
                </Button>
                {!deal.property_id ? (
                  <Link href={`/properties/new?dealId=${deal.id}`}>
                    <Button size="lg" className="w-full bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90">
                      <Home className="h-4 w-4 mr-2" />
                      Captar Propiedad
                    </Button>
                  </Link>
                ) : (
                  <Button
                    onClick={() => handleAdvance('captured')}
                    disabled={advancing}
                    size="lg"
                    className="bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90"
                  >
                    {advancing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Home className="h-4 w-4 mr-2" />}
                    Marcar como Captada
                  </Button>
                )}
              </div>
            )}

            {/* Always show Lost button */}
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLost}
                disabled={advancing}
                className="text-muted-foreground hover:text-[color:var(--destructive)] hover:bg-transparent"
              >
                <XCircle className="h-4 w-4 mr-1" /> Descartar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Creado: {formatDate(deal.created_at)} | Última actualización: {formatDate(deal.stage_changed_at || deal.updated_at)}
      </p>

      {/* Followup Modal */}
      {showFollowupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={() => setShowFollowupModal(false)}>
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-lg my-8 p-6 space-y-4 max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="space-y-1">
              <p className="eyebrow">Seguimiento</p>
              <h2 className="display text-2xl flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                Agendar Seguimiento
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Generá una tarea para llamar, escribir un mail o mandar un mensaje al cliente. Aparecerá en tus pendientes el día acordado.
            </p>

            {/* Canal */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Canal</label>
              <div className="grid grid-cols-3 gap-2">
                {(['call', 'email', 'message'] as FollowUpChannel[]).map(c => {
                  const ChannelIcon = c === 'call' ? Phone : c === 'email' ? Mail : MessageSquare
                  const active = followupChannel === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFollowupChannel(c)}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${active ? 'border-orange-500 bg-orange-50 text-orange-900 font-medium' : 'border-input bg-background hover:bg-muted/50'}`}
                    >
                      <ChannelIcon className="h-4 w-4" />
                      {CHANNEL_LABEL[c]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Fecha + Hora */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Fecha
                </label>
                <input
                  type="date"
                  min={todayIsoDate()}
                  value={followupDate}
                  onChange={e => setFollowupDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Hora
                </label>
                <input
                  type="time"
                  value={followupTime}
                  disabled={followupAllDay}
                  onChange={e => setFollowupTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:bg-muted/50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={followupAllDay}
                onChange={e => setFollowupAllDay(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              Todo el día
            </label>

            {/* Notas */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Detalle / próximos pasos</label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={followupNotes}
                onChange={e => setFollowupNotes(e.target.value)}
                placeholder="Ej: Llamar al cliente para confirmar interés en la propiedad y agendar visita."
                autoFocus
              />

              {/* Audio button */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={toggleRecording}
                  className="gap-1"
                >
                  {isRecording ? (
                    <>
                      <Square className="h-3.5 w-3.5" />
                      Detener
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5" />
                      Dictar con voz
                    </>
                  )}
                </Button>
                {isRecording && (
                  <span className="text-xs text-red-600 animate-pulse flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    Grabando...
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowFollowupModal(false); setFollowupNotes(''); recognitionRef.current?.stop(); setIsRecording(false) }} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleFollowupSubmit}
                disabled={!followupNotes.trim() || advancing}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                {advancing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                Agendar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Visit Data Modal */}
      {showVisitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={() => setShowVisitModal(false)}>
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-4xl my-8 p-6 space-y-4 max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between sticky top-0 bg-background pb-3 border-b z-10">
              <div className="space-y-1">
                <p className="eyebrow">Visita Realizada</p>
                <h2 className="display text-2xl flex items-center gap-2">
                  <Eye className="h-5 w-5 text-[color:var(--brand)]" />
                  Datos de la Visita
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowVisitModal(false)}>&times;</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Recolectá los datos de la propiedad durante la visita. Todo se guarda automáticamente.
              Al finalizar, el proceso pasa a "Visita Realizada".
            </p>
            <VisitDataForm
              dealId={deal.id}
              initial={deal.visit_data || null}
              onCompleted={() => { setShowVisitModal(false); fetchDeal() }}
            />
          </div>
        </div>
      )}

      {/* Reschedule Modal — editar fecha/hora de una tasación ya coordinada */}
      {showScheduleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => !savingSchedule && setShowScheduleModal(false)}
        >
          <div
            className="bg-background rounded-2xl shadow-xl w-full max-w-md my-8 p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-1">
              <p className="eyebrow">Reagendar</p>
              <h2 className="display text-2xl flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                Editar fecha y hora
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Modificá la fecha y la hora de la tasación coordinada. El resto del proceso queda igual.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Fecha
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Hora
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowScheduleModal(false)}
                disabled={savingSchedule}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveSchedule}
                disabled={savingSchedule || !scheduleDate}
                className="flex-1 bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90"
              >
                {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

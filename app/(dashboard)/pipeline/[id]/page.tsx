'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, ArrowLeft, User, MapPin, Calendar, Phone, Mail,
  ChevronRight, FileCheck, Home, Eye, MessageSquare, XCircle, Tag,
  Edit2, Send, Mic, MicOff, Square, UserCog
} from 'lucide-react'
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

  // Visit modal
  const [showVisitModal, setShowVisitModal] = useState(false)

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

  // Followup submission
  function handleFollowupSubmit() {
    if (!followupNotes.trim()) {
      alert('Debes describir el seguimiento antes de continuar.')
      return
    }
    const combinedNotes = notes
      ? `${notes}\n\n--- Seguimiento (${new Date().toLocaleDateString('es-AR')}) ---\n${followupNotes}`
      : `--- Seguimiento (${new Date().toLocaleDateString('es-AR')}) ---\n${followupNotes}`
    handleAdvance('followup', combinedNotes)
    setShowFollowupModal(false)
    setFollowupNotes('')
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

      {/* Progress bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {STAGES.filter(s => s.key !== 'lost' && s.key !== 'not_visited').map((s, i) => {
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
            {deal.scheduled_date && <><span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Fecha agendada:</span><span>{deal.scheduled_date}{deal.scheduled_time ? ` ${deal.scheduled_time}` : ''}</span></>}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowFollowupModal(false)}>
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="space-y-1">
              <p className="eyebrow">Seguimiento</p>
              <h2 className="display text-2xl flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                Registrar Seguimiento
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Describe el estado del seguimiento, la conversación con el cliente, o próximos pasos.
            </p>

            <div className="space-y-2">
              <textarea
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={followupNotes}
                onChange={e => setFollowupNotes(e.target.value)}
                placeholder="Ej: Hablé con el cliente, está interesado pero quiere ver otra propiedad antes de decidir..."
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
                Confirmar Seguimiento
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
    </div>
  )
}

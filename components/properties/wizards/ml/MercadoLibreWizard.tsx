'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMlPublishDraft } from './useMlPublishDraft'
import { ManageListingPanel } from './ManageListingPanel'
import { StepImages } from './steps/StepImages'
import { StepMedia } from './steps/StepMedia'
import { StepFields } from './steps/StepFields'
import { StepDescription } from './steps/StepDescription'
import { StepReview } from './steps/StepReview'
import { StepConfirm } from './steps/StepConfirm'

const STEPS = [
  { id: 'images', label: '📸 Imágenes' },
  { id: 'media', label: '🎬 Video' },
  { id: 'fields', label: '📋 Campos' },
  { id: 'description', label: '✍️ Descripción' },
  { id: 'review', label: '👁️ Resumen' },
  { id: 'confirm', label: '🚀 Publicar' },
] as const

export function MercadoLibreWizard({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const { loading, property, attrs, listing, validation, draft, patch, save, reload } = useMlPublishDraft(propertyId)
  const [idx, setIdx] = useState(0)
  const [stepValid, setStepValid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [managing, setManaging] = useState<'pause' | 'close' | 'activate' | null>(null)

  async function changeStatus(action: 'pause' | 'close' | 'activate') {
    const msg = action === 'close'
      ? '¿Cerrar el aviso DEFINITIVAMENTE? No se puede deshacer.'
      : action === 'pause'
        ? '¿Pausar el aviso? Deja de ser visible pero se puede reactivar.'
        : '¿Reactivar el aviso?'
    if (!confirm(msg)) return
    setManaging(action)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ml-publish`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      toast.success('Listo')
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setManaging(null)
    }
  }

  // Si ya hay aviso publicado, mostrar el panel de gestión
  if (!loading && listing?.external_id && property) {
    return (
      <ManageListingPanel
        listing={listing}
        propertyAddress={property.address}
        propertyTitle={property.title}
        managing={managing}
        onAction={changeStatus}
        onBackToDetail={() => router.push(`/properties/${propertyId}`)}
      />
    )
  }
  if (loading || !property || !draft) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const canPublish = validation.ok
  const current = STEPS[idx].id

  async function next() {
    setSaving(true)
    const ok = await save()
    setSaving(false)
    if (!ok) return
    setStepValid(false)
    setIdx(i => Math.min(i + 1, STEPS.length - 1))
  }
  function back() {
    setStepValid(true)
    setIdx(i => Math.max(i - 1, 0))
  }
  function goTo(targetIdx: number) {
    setStepValid(true)
    setIdx(targetIdx)
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded-full ${i < idx ? 'bg-emerald-600 text-white' : i === idx ? 'bg-[color:var(--brand)] text-white' : 'bg-muted text-muted-foreground'}`}>
              {i < idx && <CheckCircle2 className="h-3 w-3 inline mr-1" />}{s.label}
            </span>
            {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {validation.errors.length > 0 && current === 'confirm' && (
        <Card className="border-red-300">
          <CardContent className="py-3 text-sm text-red-700">{validation.errors.join(' · ')}</CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
            >
              {current === 'images' && <StepImages draft={draft} onChange={patch} onValidityChange={setStepValid} />}
              {current === 'media' && <StepMedia draft={draft} onChange={patch} onValidityChange={setStepValid} />}
              {current === 'fields' && <StepFields property={property} attrs={attrs} draft={draft} onChange={patch} onValidityChange={setStepValid} />}
              {current === 'description' && <StepDescription propertyId={propertyId} draft={draft} onChange={patch} onValidityChange={setStepValid} />}
              {current === 'review' && (
                <StepReview
                  draft={draft}
                  attrs={attrs}
                  currency={property.currency}
                  address={property.address}
                  neighborhood={property.neighborhood}
                  canPublish={canPublish}
                  onEdit={() => goTo(0)}
                  onGo={() => { void next() }}
                />
              )}
              {current === 'confirm' && (
                <StepConfirm propertyId={propertyId} draft={draft} currency={property.currency} canPublish={canPublish} onBack={back} />
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Navegación (oculta en review/confirm que tienen sus propios botones) */}
      {current !== 'review' && current !== 'confirm' && (
        <div className="flex gap-2">
          {idx > 0 && (
            <Button variant="outline" onClick={back}>
              <ArrowLeft className="h-4 w-4 mr-1" />Atrás
            </Button>
          )}
          <Button className="flex-1" onClick={next} disabled={!stepValid || saving}>
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Guardando…</>
            ) : (
              <>Siguiente<ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

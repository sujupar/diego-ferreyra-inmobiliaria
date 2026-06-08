'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ApDraft } from '../types'

interface Props {
  propertyId: string
  draft: ApDraft
  onChange: (p: Partial<ApDraft>) => void
  onValidityChange: (ok: boolean) => void
}

export function StepDescription({ propertyId, draft, onChange, onValidityChange }: Props) {
  const [generating, setGenerating] = useState(false)
  const [buyerProfile, setBuyerProfile] = useState('')

  useEffect(() => {
    onValidityChange(draft.description.trim().length >= 100)
  }, [draft.description, onValidityChange])

  async function generate() {
    setGenerating(true)
    try {
      const r = await fetch(`/api/properties/${propertyId}/generate-description`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ buyerProfile: buyerProfile || undefined, save: false }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      const g = j.generated as { title: string; subtitle: string; body: string }
      onChange({ title: g.title.slice(0, 60), description: `${g.subtitle}\n\n${g.body}` })
      toast.success('Descripción generada con el sistema GPT Portales')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Descripción del aviso</h3>
        <p className="text-sm text-muted-foreground">Generada con el sistema de prompts “GPT Portales” (tono, adjetivos permitidos, disclaimer).</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Título (máx 60)</label>
        <input
          value={draft.title}
          onChange={e => onChange({ title: e.target.value.slice(0, 60) })}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">{draft.title.length}/60</p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <input
          value={buyerProfile}
          onChange={e => setBuyerProfile(e.target.value)}
          placeholder="Perfil del comprador ideal (opcional): familia, inversor, soltero…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <Button onClick={generate} disabled={generating} className="w-full">
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1" />Generando…</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-1" />Generar / Regenerar descripción</>
          )}
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Descripción (mín 100)</label>
        <textarea
          value={draft.description}
          onChange={e => onChange({ description: e.target.value })}
          rows={12}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <p className={`text-xs ${draft.description.length >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
          {draft.description.length} caracteres (mín 100)
        </p>
      </div>
    </div>
  )
}

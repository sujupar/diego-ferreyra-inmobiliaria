'use client'
import { useEffect } from 'react'
import type { ApDraft } from '../types'
import { extractYouTubeId } from '@/lib/portals/mercadolibre/media'

interface Props {
  draft: ApDraft
  onChange: (p: Partial<ApDraft>) => void
  onValidityChange: (ok: boolean) => void
}

export function StepMedia({ draft, onChange, onValidityChange }: Props) {
  // Media es opcional → siempre válido.
  useEffect(() => {
    onValidityChange(true)
  }, [onValidityChange])

  const ytId = extractYouTubeId(draft.videoUrl)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-medium">Video y recorrido</h3>
        <p className="text-sm text-muted-foreground">Argenprop acepta un video de YouTube. Elegí qué mandar (uno u otro).</p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">URL del video (YouTube)</span>
        <input
          value={draft.videoUrl ?? ''}
          onChange={e => onChange({ videoUrl: e.target.value || null })}
          placeholder="https://youtu.be/..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        {draft.videoUrl && !ytId && <span className="text-xs text-amber-600">No se reconoció un ID de YouTube válido.</span>}
        {ytId && <span className="text-xs text-emerald-600">✓ Video detectado ({ytId})</span>}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">URL del recorrido 3D (Matterport u otro)</span>
        <input
          value={draft.tour3dUrl ?? ''}
          onChange={e => onChange({ tour3dUrl: e.target.value || null })}
          placeholder="https://my.matterport.com/show/?m=..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>

      <div className="space-y-2">
        <span className="text-sm font-medium">¿Qué mandamos a Argenprop?</span>
        <div className="grid grid-cols-3 gap-2">
          {([['video', '🎬 Video'], ['tour', '🏠 Recorrido'], ['none', '— Ninguno']] as const).map(([val, label]) => {
            const disabled = (val === 'video' && !ytId) || (val === 'tour' && !draft.tour3dUrl)
            return (
              <button
                key={val}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ mediaChoice: val })}
                className={`rounded-lg border-2 py-3 text-sm ${draft.mediaChoice === val ? 'border-emerald-500 bg-emerald-50' : 'border-muted'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">El recorrido 3D se incluye como link en la descripción; Argenprop solo acepta video nativo.</p>
      </div>
    </div>
  )
}

'use client'
import type { ApAttributesResponse, ApDraft } from '../types'

interface Props {
  draft: ApDraft
  attrs: ApAttributesResponse | null
  currency: string
  address: string
  neighborhood: string
  onEdit: () => void
  onGo: () => void
  canPublish: boolean
}

export function StepReview({ draft, attrs, currency, address, neighborhood, onEdit, onGo, canPublish }: Props) {
  const filledAttrs = [...(attrs?.required ?? []), ...(attrs?.recommended ?? [])]
    .map(a => ({
      name: a.name,
      val: draft.apAttributes[a.id]?.value_name ?? a.allowedValues?.find(v => v.id === draft.apAttributes[a.id]?.value_id)?.name,
    }))
    .filter(x => x.val)

  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium flex items-center gap-2">👁️ Así se va a ver el aviso</h3>
      <div className="rounded-lg border overflow-hidden">
        {draft.photos[0] && (
          <div className="grid grid-cols-3 gap-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.photos[0]} alt="" className="col-span-2 row-span-2 aspect-[4/3] object-cover w-full" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {draft.photos[1] && <img src={draft.photos[1]} alt="" className="aspect-square object-cover w-full" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {draft.photos[2] && <img src={draft.photos[2]} alt="" className="aspect-square object-cover w-full" />}
          </div>
        )}
        <div className="p-4 space-y-2">
          <p className="text-2xl font-semibold">
            {new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(draft.askingPrice)}
          </p>
          <h4 className="text-lg font-medium">{draft.title}</h4>
          <p className="text-sm text-muted-foreground">{address} · {neighborhood}</p>
          {filledAttrs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {filledAttrs.slice(0, 10).map((a, i) => (
                <span key={i} className="text-xs rounded-full bg-muted px-2 py-0.5">{a.name}: {a.val}</span>
              ))}
            </div>
          )}
          <div className="rounded border bg-muted/30 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-auto mt-2">{draft.description}</div>
          {draft.mediaChoice !== 'none' && (
            <p className="text-xs text-muted-foreground">{draft.mediaChoice === 'video' ? '🎬 Con video' : '🏠 Con recorrido 3D'}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onEdit} className="flex-1 rounded-md border py-2 text-sm">Editar algo</button>
        <button onClick={onGo} disabled={!canPublish} className="flex-1 rounded-md bg-[color:var(--brand)] text-white py-2 text-sm disabled:opacity-50">
          OK, ir a publicar →
        </button>
      </div>
    </div>
  )
}

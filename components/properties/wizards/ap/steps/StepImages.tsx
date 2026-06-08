'use client'
import { useEffect, useState } from 'react'
import type { MlDraft } from '../types'

interface Props {
  draft: MlDraft
  onChange: (p: Partial<MlDraft>) => void
  onValidityChange: (ok: boolean) => void
}

const RANK_LABEL = ['⭐ Portada', '2ª', '3ª']
const RANK_COLOR = ['border-emerald-500', 'border-blue-500', 'border-blue-500']

export function StepImages({ draft, onChange, onValidityChange }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const photos = draft.photos

  useEffect(() => {
    onValidityChange(photos.length >= 1)
  }, [photos.length, onValidityChange])

  function reorder(from: number, to: number) {
    if (from === to) return
    const next = [...photos]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange({ photos: next })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Elegí las fotos del aviso</h3>
        <p className="text-sm text-muted-foreground">
          Arrastrá para ordenar. La <b>⭐ portada</b> y las <b>2 siguientes</b> son las que ML muestra primero.
        </p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {photos.map((url, i) => (
          <div
            key={url}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null) reorder(dragIdx, i)
              setDragIdx(null)
            }}
            className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing ${i < 3 ? RANK_COLOR[i] : 'border-transparent'}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Foto ${i + 1}`} className="object-cover w-full h-full pointer-events-none" />
            {i < 3 && (
              <span className="absolute bottom-1 left-1 rounded-full bg-black/70 text-white text-[10px] px-2 py-0.5">
                {RANK_LABEL[i]}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className={`text-xs ${photos.length >= 6 ? 'text-emerald-600' : 'text-amber-600'}`}>
        {photos.length} foto{photos.length === 1 ? '' : 's'} · ML recomienda al menos 6 de buena calidad
      </p>
      {photos.length === 0 && (
        <p className="text-xs text-red-600">Cargá al menos una foto en la ficha de la propiedad antes de publicar.</p>
      )}
    </div>
  )
}

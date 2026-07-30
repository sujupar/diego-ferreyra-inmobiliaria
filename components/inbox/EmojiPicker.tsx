'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Smile } from 'lucide-react'

/**
 * Selector de emojis del chat (task 9, prioridad 7 — la última, "cortar desde
 * el final" si faltaba tiempo). Set fijo de los más usados en mensajería de
 * atención al cliente inmobiliaria — no hace falta un picker completo con
 * miles de emojis/búsqueda para este caso de uso.
 */
const EMOJIS = [
  '😊', '👍', '🙏', '🏡', '📸', '📍', '📅', '✅',
  '❤️', '😀', '👋', '🔑', '💬', '📞', '⏰', '🎉',
]

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(v => !v)} aria-label="Elegir un emoji">
        <Smile className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 grid grid-cols-8 gap-1 rounded-lg border bg-background p-2 shadow-lg z-10">
          {EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              className="rounded p-1 text-lg hover:bg-muted"
              onClick={() => {
                onSelect(e)
                setOpen(false)
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

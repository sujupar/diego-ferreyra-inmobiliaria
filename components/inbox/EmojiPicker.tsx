'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Smile } from 'lucide-react'

/**
 * Selector de emojis del chat (task 9, prioridad 7 — la última, "cortar desde
 * el final" si faltaba tiempo). Set fijo de los más usados en mensajería de
 * atención al cliente inmobiliaria — no hace falta un picker completo con
 * miles de emojis/búsqueda para este caso de uso.
 *
 * Tamaño (Ajuste 3, `fix/chat-filtros-compactos`, 2026-08-01): el dueño lo vio
 * "hiper mega pequeñito" — antes era una grilla de 8 columnas con `p-1` y
 * `text-lg` metida en un cuadrito diminuto. Ahora: grilla de 8 columnas pero
 * con celdas de área de clic generosa (`h-10 w-10`), emoji más grande
 * (`text-2xl`), separación entre celdas, padding interno del panel, ancho fijo
 * (`w-72`) para que las 8 columnas respiren, y alto máximo con scroll si el
 * set de emojis crece.
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
        <div className="absolute bottom-full right-0 z-10 mb-2 w-72 max-h-64 overflow-y-auto rounded-xl border bg-background p-3 shadow-lg">
          <div className="grid grid-cols-8 gap-1.5">
            {EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl leading-none hover:bg-muted"
                onClick={() => {
                  onSelect(e)
                  setOpen(false)
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

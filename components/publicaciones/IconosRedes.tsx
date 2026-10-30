'use client'

import { Facebook, Instagram, Youtube } from 'lucide-react'
import { toast } from 'sonner'
import { PLATAFORMAS, type Plataforma } from '@/lib/publicaciones/tipos'

/** TikTok no está en lucide: su nota musical, en el mismo trazo que el resto. */
function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 3c.5 2.6 2.4 4.5 5 5" />
    </svg>
  )
}

export const REDES: Record<Plataforma, { nombre: string; Icono: (p: { className?: string }) => React.ReactNode; color: string }> = {
  instagram: { nombre: 'Instagram', Icono: Instagram, color: 'bg-pink-600 text-white border-pink-600' },
  facebook: { nombre: 'Facebook', Icono: Facebook, color: 'bg-blue-600 text-white border-blue-600' },
  youtube: { nombre: 'YouTube', Icono: Youtube, color: 'bg-red-600 text-white border-red-600' },
  tiktok: { nombre: 'TikTok (borrador)', Icono: TikTok, color: 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white' },
}

interface Props {
  redes: Plataforma[]
  onCambio: (redes: Plataforma[]) => void
  deshabilitado?: boolean
}

export function IconosRedes({ redes, onCambio, deshabilitado }: Props) {
  const encendidas = new Set(redes)
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Redes donde se publica">
      {PLATAFORMAS.map((p) => {
        const { nombre, Icono, color } = REDES[p]
        const activa = encendidas.has(p)
        return (
          <button
            key={p}
            type="button"
            aria-pressed={activa}
            aria-label={nombre}
            title={nombre}
            disabled={deshabilitado}
            onClick={() => {
              if (activa && encendidas.size === 1) {
                toast.info('Si no va a ninguna red, quitá el video')
                return
              }
              onCambio(activa ? redes.filter((r) => r !== p) : PLATAFORMAS.filter((r) => r === p || encendidas.has(r)))
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              activa ? color : 'border-border bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            <Icono className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}

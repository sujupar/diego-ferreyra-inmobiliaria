'use client'

import Link from 'next/link'
import { ArrowRight, CalendarCheck, CircleCheck, MessageCircle, Phone, RefreshCw, TriangleAlert, X } from 'lucide-react'
import type { AccionAviso, Aviso, IconoLinea } from '@/lib/crm/aviso-guardado'
import { cn } from '@/lib/utils'
import { ALTO_CONTROL } from '../ui/medidas'

// El aviso de lo que pasó al guardar una llamada o un WhatsApp (maqueta `.ficha-aviso`).
// Qué dice y qué ofrece lo arma `armarAviso` (lib/crm/aviso-guardado.ts); acá solo se
// dibuja. Es estado de la pantalla: se pierde con la X o al recargar, por eso
// "Coordinar tasación" y "Deshacer" tienen además un lugar fijo en "Procesos" (D5).

const ICONOS: Record<IconoLinea, typeof ArrowRight> = {
  agenda: CalendarCheck,
  cerrada: CircleCheck,
  flecha: ArrowRight,
  aviso: TriangleAlert,
  whatsapp: MessageCircle,
}

const BOTON = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60'

export function AvisoGuardado({
  aviso,
  ref,
  ocupado,
  onAccion,
  onCerrar,
}: {
  aviso: Aviso
  ref?: React.Ref<HTMLDivElement>
  ocupado?: boolean
  onAccion: (a: AccionAviso) => void
  onCerrar: () => void
}) {
  const pendiente = aviso.variante === 'pendiente'
  const Principal = pendiente ? TriangleAlert : aviso.titulo.startsWith('WhatsApp') ? MessageCircle : Phone
  return (
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      data-aviso={aviso.variante}
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-[calc(var(--radius)+4px)] border py-3 pl-3.5 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-brand',
        pendiente
          ? 'border-destructive/35 bg-destructive-suave'
          : 'border-[color-mix(in_oklch,var(--brand)_25%,var(--border))] bg-brand-soft',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          pendiente ? 'bg-destructive text-white' : 'bg-brand text-brand-foreground',
        )}
      >
        <Principal aria-hidden className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <p className="text-sm font-semibold">{aviso.titulo}</p>
        {aviso.lineas.map((l, i) => {
          const I = ICONOS[l.icono]
          return (
            <p key={i} className="flex items-start gap-1.5 text-[13px]">
              <I aria-hidden className={cn('mt-[0.1875rem] size-3.5 shrink-0', pendiente ? 'text-destructive-texto' : 'text-brand')} />
              <span>{l.texto}</span>
            </p>
          )
        })}
        {aviso.acciones.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {aviso.acciones.map((a) => {
              const base = cn(BOTON, ALTO_CONTROL)
              switch (a.tipo) {
                case 'coordinar':
                  return (
                    <Link key={a.tipo} href={a.href} className={cn(base, 'bg-brand text-brand-foreground hover:bg-brand/90')}>
                      <CalendarCheck aria-hidden className="size-4" />
                      {a.etiqueta}
                    </Link>
                  )
                case 'abrir':
                  return (
                    <Link key={a.tipo} href={a.href} className={cn(base, 'border border-border bg-card hover:bg-accent')}>
                      {a.etiqueta}
                    </Link>
                  )
                case 'perdido':
                  return (
                    <button
                      key={a.tipo}
                      type="button"
                      disabled={ocupado}
                      onClick={() => onAccion(a)}
                      className={cn(base, 'border border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] bg-transparent text-destructive-texto hover:bg-destructive-suave')}
                    >
                      {a.etiqueta}
                    </button>
                  )
                case 'reintentar':
                  return (
                    <button key={a.tipo} type="button" disabled={ocupado} onClick={() => onAccion(a)} className={cn(base, 'border border-border bg-card hover:bg-accent')}>
                      <RefreshCw aria-hidden className="size-4" />
                      {a.etiqueta}
                    </button>
                  )
                case 'ver_tareas':
                  return (
                    <button
                      key={a.tipo}
                      type="button"
                      onClick={() => onAccion(a)}
                      data-solo="pestanas"
                      className={cn(base, 'ficha-solo-pestanas border border-border bg-card hover:bg-accent')}
                    >
                      {a.etiqueta}
                    </button>
                  )
                case 'dejar_abierto':
                  return (
                    <button key={a.tipo} type="button" onClick={() => onAccion(a)} className={cn(base, 'hover:bg-accent')}>
                      {a.etiqueta}
                    </button>
                  )
              }
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Cerrar el aviso"
        onClick={onCerrar}
        className="-mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-accent raton:size-9"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}

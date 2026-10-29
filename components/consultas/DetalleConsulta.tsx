'use client'

import Link from 'next/link'
import { Check, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { MOTIVO_TEXTO } from '@/lib/consultas/telefono'
import {
  enlaceSeguro, etiquetaPortal, horaDeLaConsulta, nombreVisible, textoPropiedad, textoVisita,
} from '@/lib/consultas/pantalla'
import { formatearFechaHora } from '@/lib/visitas/horario'
import type { ConsultaEnBandeja } from '@/lib/consultas/tipos'

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      {children}
    </div>
  )
}

/** "12/10": la otra consulta puede ser de otro mes; la hora no aporta acá. */
function fechaCorta(iso: string): string {
  const [dia] = formatearFechaHora(iso).split(' · ')
  return dia.replace(/^\S+\s/, '').replace(/^0/, '')
}

function Telefono({ c }: { c: ConsultaEnBandeja }) {
  if (c.tel.ok) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          <Check aria-hidden="true" className="h-3.5 w-3.5" /> WhatsApp listo
        </span>
        <span className="text-lg font-semibold">{c.tel.mostrado}</span>
        {c.tel.corregido && c.telefono && (
          <span className="text-xs text-muted-foreground">{`Lo dejó como «${c.telefono}»`}</span>
        )}
        <div className="mt-1 flex gap-2">
          <a href={`https://wa.me/${c.tel.whatsapp}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-emerald-200 bg-background text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:text-emerald-300">
            Abrir WhatsApp
          </a>
          <a href={`tel:+${c.tel.whatsapp}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border bg-background text-sm font-semibold">
            Llamar
          </a>
        </div>
      </div>
    )
  }
  if (c.tel.motivo === 'vacio' && c.portal === 'mercadolibre') {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        MercadoLibre no comparte el contacto. Para agendar hay que pedirle el teléfono.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 dark:bg-amber-950/30">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
        <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" /> Teléfono a revisar
      </span>
      {c.tel.crudo.trim() && <span className="text-base font-semibold">{c.tel.crudo}</span>}
      <span className="text-xs text-muted-foreground">{MOTIVO_TEXTO[c.tel.motivo]}</span>
    </div>
  )
}

/**
 * El detalle de una consulta (spec §3.2): panel lateral en la compu, pantalla
 * completa en el celular (`w-full` hasta `sm`). Todo lo que viene del portal
 * (nombre, mensaje, enlace) es texto de terceros: React lo escapa y el enlace
 * pasa por `enlaceSeguro`.
 */
export function DetalleConsulta({ consulta: c, otras, abierto, onCerrar, onAgendar }: {
  consulta: ConsultaEnBandeja | null
  /** Otras consultas ya traídas de la misma persona. */
  otras: ConsultaEnBandeja[]
  abierto: boolean
  onCerrar: () => void
  onAgendar: (c: ConsultaEnBandeja) => void
}) {
  return (
    <Sheet open={abierto && c !== null} onOpenChange={(o) => { if (!o) onCerrar() }}>
      <SheetContent side="right" showCloseButton={false}
        className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {c && <Contenido c={c} otras={otras} onCerrar={onCerrar} onAgendar={onAgendar} />}
      </SheetContent>
    </Sheet>
  )
}

function Contenido({ c, otras, onCerrar, onAgendar }: {
  c: ConsultaEnBandeja; otras: ConsultaEnBandeja[]; onCerrar: () => void; onAgendar: (c: ConsultaEnBandeja) => void
}) {
  const propiedad = textoPropiedad(c)
  const aviso = enlaceSeguro(c.aviso_url)
  const visita = textoVisita(c)
  const visitaId = c.estado.tipo === 'sin_visita' ? null : c.estado.visitaId
  const encabezado = [
    c.numero !== null ? `Consulta #${c.numero}` : c.tipo === 'landing' ? 'Registro en la landing' : 'Consulta',
    `${formatearFechaHora(c.recibida_at).split(' · ')[0]} ${horaDeLaConsulta(c)}`,
  ].join(' · ')

  return (
    <div className="flex flex-col gap-4 p-5 pb-[calc(1.25rem+var(--safe-b,0px))]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <SheetDescription className="text-xs">{encabezado}</SheetDescription>
          <SheetTitle className="text-xl font-bold break-words">{nombreVisible(c)}</SheetTitle>
          {c.email && <span className="text-sm break-all text-muted-foreground">{c.email}</span>}
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" className="min-h-11 min-w-11 shrink-0" onClick={onCerrar}>
          <X aria-hidden="true" className="h-5 w-5" />
        </Button>
      </div>

      <Telefono c={c} />

      <Bloque titulo="Preguntó por">
        <div className="flex flex-col gap-1 rounded-lg border p-3">
          <span className={cn('text-sm font-semibold', propiedad.sinPropiedad && 'text-amber-800 dark:text-amber-300')}>
            {propiedad.texto}
          </span>
          {propiedad.sinPropiedad && (c.aviso_titulo || c.aviso_direccion) && (
            <span className="text-xs text-muted-foreground">{[c.aviso_titulo, c.aviso_direccion].filter(Boolean).join(' · ')}</span>
          )}
          {c.asesor_nombre && <span className="text-xs text-muted-foreground">{`Asesor: ${c.asesor_nombre}`}</span>}
          {aviso && (
            <a href={aviso} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-brand underline-offset-2 hover:underline">
              {`Ver aviso en ${etiquetaPortal(c.portal)}`}
            </a>
          )}
        </div>
      </Bloque>

      {c.mensaje?.trim() && (
        <Bloque titulo="Mensaje">
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed break-words whitespace-pre-line">{c.mensaje}</p>
        </Bloque>
      )}

      {otras.length > 0 && (
        <Bloque titulo="Otras consultas de esta persona">
          <ul className="flex flex-col gap-1 text-sm">
            {otras.map((o) => (
              <li key={o.id}>{`${textoPropiedad(o).texto} · ${etiquetaPortal(o.portal)} · ${fechaCorta(o.recibida_at)}`}</li>
            ))}
          </ul>
        </Bloque>
      )}

      {visita && visitaId ? (
        <Link href={`/visits/${visitaId}`}
          className="inline-flex min-h-12 items-center justify-center rounded-lg border text-sm font-semibold">
          {`${visita} · Ver la visita`}
        </Link>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Button type="button" className="min-h-12 bg-brand text-base text-brand-foreground hover:bg-brand/90" onClick={() => onAgendar(c)}>
            Agendar visita
          </Button>
          {c.accion === 'agendar' && (
            <span className="text-center text-xs text-muted-foreground">Persona y propiedad ya cargadas: solo elegís día y hora.</span>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * Hoja "Visita agendada" (lienzo, pantalla 3). Lo primero que sigue después de
 * agendar es avisarle a la persona: el botón principal abre el WhatsApp del
 * asesor con el mensaje ya escrito (`enlaceConfirmacion`); lo revisa y lo manda
 * él. Nunca se manda nada solo desde acá.
 */
import Link from 'next/link'
import { Check, MessageCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { enlaceConfirmacion } from '@/lib/consultas/confirmar'
import { tituloListo } from '@/lib/consultas/agendar-desde-consulta'

interface Props {
  visita: { id: string; fecha: string; hora: string }
  nombre: string
  /** Para el mensaje de WhatsApp: "Tarija 4000". */
  direccion: string
  /** Para mostrar: "Tarija 4000, Boedo". */
  direccionMostrada: string
  /** Dígitos con código de país; sin teléfono no hay botón de WhatsApp. */
  whatsapp: string | null
  /** El nombre que dejó la persona (para el saludo); `null` si no dejó. */
  nombreParaSaludo: string | null
  onVolver: () => void
}

export function HojaVisitaAgendada({ visita, nombre, direccion, direccionMostrada, whatsapp, nombreParaSaludo, onVolver }: Props) {
  const cuando = tituloListo(visita.fecha, visita.hora)
  const enlace = whatsapp
    ? enlaceConfirmacion({ whatsapp, nombre: nombreParaSaludo, direccion, fecha: visita.fecha, hora: visita.hora })
    : null
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onVolver() }}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-md">
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <Check aria-hidden="true" className="h-8 w-8" strokeWidth={2.4} />
          </span>
          {/* Un solo título para lectores de pantalla: "Visita agendada · jueves 30 · 17:00". */}
          <DialogTitle className="text-xl font-bold">
            Visita agendada<span className="sr-only"> · </span>
            <span className="mt-1 block text-base font-normal">{cuando}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground break-words">
            {nombre} · {direccionMostrada}
          </DialogDescription>
        </div>

        {enlace && (
          <div className="flex flex-col gap-1.5">
            <a href={enlace} target="_blank" rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-base font-semibold text-white hover:bg-emerald-800">
              <MessageCircle aria-hidden="true" className="h-5 w-5" />
              Confirmarle por WhatsApp
            </a>
            <p className="text-center text-xs text-muted-foreground">
              Se abre tu WhatsApp con el mensaje escrito: lo revisás y lo mandás vos.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" className="min-h-12">
            <Link href={`/visits/${visita.id}`}>Ver la visita</Link>
          </Button>
          <Button type="button" variant="outline" className="min-h-12" onClick={onVolver}>Volver a consultas</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

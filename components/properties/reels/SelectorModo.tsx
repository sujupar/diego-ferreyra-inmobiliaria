'use client'

/**
 * Un solo selector en vez de dos interruptores ("Automatización" y "Modo
 * simulacro"), que el dueño no supo cuándo usar (2026-09-22).
 *
 * "En vivo" pide confirmación: es el único que le escribe a clientes reales, y
 * no puede pasar por un clic de más. La traducción a las columnas vive en
 * `lib/social/reels/modo.ts`.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import type { ModoReel } from '@/lib/social/reels/modo'

interface Props {
  valor: ModoReel
  onCambiar: (modo: ModoReel) => void
  /** Sin landing no se puede prender: es el enlace que recibe la persona. */
  landingPublicada: boolean
  /** Sin palabras no se puede prender: no coincidiría con nada. */
  hayPalabras: boolean
  /** El interruptor general. Apagado, ningún modo responde todavía. */
  automatizacionGeneral: boolean
  deshabilitado?: boolean
}

const OPCIONES: { modo: ModoReel; titulo: string; detalle: string }[] = [
  { modo: 'apagado', titulo: 'Apagado', detalle: 'No le responde a nadie.' },
  {
    modo: 'prueba',
    titulo: 'Modo prueba',
    detalle: 'Le responde de verdad solo a las cuentas de prueba. A los demás los anota, sin escribirles, para que veas cuántos habría contestado.',
  },
  { modo: 'en_vivo', titulo: 'En vivo', detalle: 'Le responde a todo el que comente alguna de las palabras.' },
]

export function SelectorModo({ valor, onCambiar, landingPublicada, hayPalabras, automatizacionGeneral, deshabilitado }: Props) {
  const [confirmandoEnVivo, setConfirmandoEnVivo] = useState(false)

  // Apagar se puede SIEMPRE: si la landing se despublica mientras el reel
  // responde solo, bloquear el selector dejaría al asesor sin forma de frenarlo.
  const puedePrender = landingPublicada && hayPalabras

  const elegir = (modo: ModoReel) => {
    if (modo === valor) return
    if (modo === 'en_vivo') { setConfirmandoEnVivo(true); return }
    setConfirmandoEnVivo(false)
    onCambiar(modo)
  }

  return (
    <fieldset className="space-y-2 rounded-lg border p-3" disabled={deshabilitado}>
      <legend className="px-1 text-sm font-medium">¿Cómo responde este reel?</legend>

      <div role="radiogroup" aria-label="Modo del reel" className="space-y-2">
        {OPCIONES.map((o) => {
          const bloqueada = o.modo !== 'apagado' && !puedePrender && valor !== o.modo
          const elegida = valor === o.modo
          return (
            <button
              key={o.modo}
              type="button"
              role="radio"
              aria-checked={elegida}
              disabled={deshabilitado || bloqueada}
              onClick={() => elegir(o.modo)}
              className={`flex w-full items-start gap-2 rounded-md border p-2.5 text-left transition ${
                elegida ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              } ${bloqueada ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span
                className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${elegida ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`}
                aria-hidden
              />
              <span>
                <span className="block text-sm font-medium">{o.titulo}</span>
                <span className="block text-xs text-muted-foreground">{o.detalle}</span>
              </span>
            </button>
          )
        })}
      </div>

      {confirmandoEnVivo && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5" role="alertdialog" aria-label="Confirmar En vivo">
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            En vivo le responde a clientes reales, a la vista de todos. ¿Confirmás?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { setConfirmandoEnVivo(false); onCambiar('en_vivo') }}
            >
              Sí, pasar a En vivo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmandoEnVivo(false)}>
              No, dejarlo como está
            </Button>
          </div>
        </div>
      )}

      {!landingPublicada && (
        <p className="text-xs text-amber-700 dark:text-amber-500">
          Para prenderlo hace falta la landing publicada: es el enlace que recibe la persona.
        </p>
      )}
      {!hayPalabras && (
        <p className="text-xs text-amber-700 dark:text-amber-500">Para prenderlo hace falta al menos una palabra.</p>
      )}
      {!automatizacionGeneral && valor !== 'apagado' && (
        <p className="text-xs text-amber-700 dark:text-amber-500" role="status">
          La automatización general está apagada: aunque elijas {valor === 'prueba' ? 'Modo prueba' : 'En vivo'}, no
          va a responder hasta que se prenda.
        </p>
      )}
    </fieldset>
  )
}

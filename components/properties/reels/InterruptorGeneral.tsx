'use client'

/**
 * El interruptor general de Instagram, en la tarjeta de Reels.
 *
 * Es la llave por encima de TODOS los reels: apagada, ningún reel responde, esté
 * en el modo que esté. Lo tocan solo admin y dueño (lo decide el servidor; acá
 * solo se evita ofrecer un botón que va a dar 403). Prender pide confirmación y
 * dice cuántos reels empiezan a responder; apagar es inmediato, porque frenar
 * nunca puede costar un clic de más.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { AlertTriangle, Loader2, Power } from 'lucide-react'
import { avisoAlPrender, type ReelsActivos } from '@/lib/social/reels/interruptor'

interface Props {
  prendida: boolean
  privados: boolean
  reelsActivos: ReelsActivos
  puedeCambiar: boolean
  /** Lo llama con el valor nuevo; resuelve cuando el servidor confirmó. */
  onCambiar: (prendida: boolean) => Promise<void>
}

export function InterruptorGeneral({ prendida, privados, reelsActivos, puedeCambiar, onCambiar }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const aplicar = async (valor: boolean) => {
    setGuardando(true)
    setError(null)
    try {
      await onCambiar(valor)
      setConfirmando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setGuardando(false)
    }
  }

  const alTocar = (valor: boolean) => {
    if (valor) { setConfirmando(true); return }
    void aplicar(false)
  }

  return (
    <div className={`space-y-2 rounded-lg border p-3 ${prendida ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5' : 'bg-muted/30'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Power className="h-3.5 w-3.5" aria-hidden />
            Automatización general de Instagram:{' '}
            <span className={prendida ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
              {prendida ? 'Encendida' : 'Apagada'}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Es la llave de todos los reels de todas las propiedades. Apagada, ninguno responde, esté en el modo que esté.
          </p>
          <p className="text-xs text-muted-foreground">
            Mensajes privados: {privados ? 'habilitados' : 'esperando el permiso de Meta (por ahora solo se responde en el comentario)'}
          </p>
          {!puedeCambiar && (
            <p className="text-xs text-muted-foreground">Solo el admin o el dueño pueden cambiarla.</p>
          )}
        </div>
        {puedeCambiar && (
          <Switch
            aria-label="Automatización general de Instagram"
            checked={prendida || confirmando}
            disabled={guardando}
            onCheckedChange={alTocar}
          />
        )}
      </div>

      {confirmando && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-500/30 dark:bg-amber-500/10" role="alertdialog" aria-label="Confirmar encender">
          <p className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {avisoAlPrender(reelsActivos)}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void aplicar(true)} disabled={guardando}>
              {guardando && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
              Sí, encender
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

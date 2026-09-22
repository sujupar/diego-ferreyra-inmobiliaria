'use client'

/**
 * Configurar UN reel: la descripción (si es uno subido), las palabras, TODOS los
 * mensajes y el modo (Apagado / Modo prueba / En vivo).
 *
 * Los mensajes se muestran con el mismo bloque que al enganchar
 * (`RevisionMensajes`), y el modo con un solo selector: los dos interruptores de
 * antes no se entendían (2026-09-22).
 */
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { CampoPalabras, palabrasSonValidas } from './CampoPalabras'
import { RevisionMensajes, mensajesDelReel, problemaDeMensajes, type MensajesEditables } from './RevisionMensajes'
import { SelectorModo } from './SelectorModo'
import { separarPalabras } from '@/lib/social/reels/palabra-clave'
import { camposDelModo, modoDelReel, type ModoReel } from '@/lib/social/reels/modo'

interface ReelCompleto {
  id: string
  origen: 'subido' | 'existente'
  descripcion: string
  palabra_clave: string | null
  dm_texto: string | null
  dm_boton: string
  dm_seguimiento: string | null
  respuestas_con_privado?: string[] | null
  respuestas_sin_privado?: string[] | null
  automatizacion_activa: boolean
  simulacro: boolean
}

export interface InterruptoresGenerales {
  automatizacion: boolean
  privados: boolean
}

interface Props {
  propertyId: string
  reelId: string | null
  landingPublicada: boolean
  slugLanding: string | null
  general: InterruptoresGenerales
  onCerrar: () => void
  onListo: () => void
}

async function leerJson<T>(res: Response): Promise<T> {
  const texto = await res.text()
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new Error('El servidor tardó demasiado en responder. Probá de nuevo.')
  }
}

export function ConfigurarReelDialog({ propertyId, reelId, landingPublicada, slugLanding, general, onCerrar, onListo }: Props) {
  const [reel, setReel] = useState<ReelCompleto | null>(null)
  const [mensajes, setMensajes] = useState<MensajesEditables | null>(null)
  const [modo, setModo] = useState<ModoReel>('apagado')
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!reelId) return
    // Se limpia ANTES de pedir: si no, al abrir otro reel se ven los textos del
    // anterior mientras carga, y lo que se llegue a tipear en ese lapso lo pisa
    // la respuesta que viene en camino.
    setReel(null)
    setMensajes(null)
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/reels`)
      const cuerpo = await leerJson<{ reels?: ReelCompleto[]; error?: string }>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudo cargar el reel')
      const encontrado = (cuerpo.reels ?? []).find((r) => r.id === reelId) ?? null
      if (!encontrado) throw new Error('No se encontró el reel')
      setReel(encontrado)
      setMensajes(mensajesDelReel(encontrado))
      setModo(modoDelReel(encontrado))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [propertyId, reelId])

  useEffect(() => { if (reelId) void cargar() }, [reelId, cargar])

  const hayPalabras = !!reel && separarPalabras(reel.palabra_clave).length > 0
  const problema =
    (mensajes && problemaDeMensajes(mensajes)) ||
    (reel && !palabrasSonValidas(reel.palabra_clave ?? '') ? 'Revisá las palabras.' : null) ||
    (modo !== 'apagado' && !hayPalabras ? 'Para prenderlo hace falta al menos una palabra.' : null)

  const guardar = async () => {
    if (!reel || !mensajes) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/reels/${reel.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          descripcion: reel.descripcion,
          palabra_clave: reel.palabra_clave,
          ...mensajes,
          ...camposDelModo(modo),
        }),
      })
      const cuerpo = await leerJson<{ error?: string }>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudo guardar')
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setGuardando(false)
    }
  }

  const editar = (campos: Partial<ReelCompleto>) =>
    setReel((actual) => (actual ? { ...actual, ...campos } : actual))

  return (
    <Dialog open={!!reelId} onOpenChange={(v) => !v && !guardando && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Configurar el reel</DialogTitle>
          <DialogDescription>
            Qué palabras se reconocen, qué se le responde a la gente y si el reel está respondiendo.
          </DialogDescription>
        </DialogHeader>

        {cargando && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Cargando…
          </p>
        )}

        {reel && mensajes && (
          <div className="space-y-4">
            <SelectorModo
              valor={modo}
              onCambiar={setModo}
              landingPublicada={landingPublicada}
              hayPalabras={hayPalabras}
              automatizacionGeneral={general.automatizacion}
              deshabilitado={guardando}
            />

            {/* La descripción de un reel YA publicado vive en Instagram y no se
                puede cambiar desde la API: se oculta en vez de ofrecer un campo
                que no haría nada. */}
            {reel.origen === 'subido' && (
              <div className="space-y-1.5">
                <Label htmlFor="cfg-descripcion">Descripción de la publicación</Label>
                <Textarea
                  id="cfg-descripcion"
                  rows={6}
                  maxLength={2200}
                  value={reel.descripcion}
                  disabled={guardando}
                  onChange={(e) => editar({ descripcion: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Sin precio, a propósito.</p>
              </div>
            )}

            <CampoPalabras
              id="cfg-palabra"
              valor={reel.palabra_clave ?? ''}
              onCambiar={(valor) => editar({ palabra_clave: valor })}
              deshabilitado={guardando}
              conDescripcion={reel.origen !== 'existente'}
            />

            <RevisionMensajes
              valor={mensajes}
              onCambiar={setMensajes}
              palabraDeEjemplo={separarPalabras(reel.palabra_clave)[0] ?? ''}
              slugLanding={slugLanding}
              privadosActivos={general.privados}
              deshabilitado={guardando}
            />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={!reel || !mensajes || guardando || !!problema}>
            {guardando && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

/**
 * Los textos de UN reel: la descripción, la palabra, y el mensaje privado.
 *
 * El privado se escribe POR REEL, no una plantilla única para todos — decisión
 * del dueño (2026-09-22). Los campos vienen con un texto sugerido cargado para
 * que nunca haya que arrancar de cero.
 */
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { CampoPalabras, palabrasSonValidas } from './CampoPalabras'
import { separarPalabras } from '@/lib/social/reels/palabra-clave'

interface ReelCompleto {
  id: string
  origen: 'subido' | 'existente'
  descripcion: string
  palabra_clave: string | null
  dm_texto: string | null
  dm_boton: string
  dm_seguimiento: string | null
  automatizacion_activa: boolean
  simulacro: boolean
}

interface Props {
  propertyId: string
  reelId: string | null
  landingPublicada: boolean
  onCerrar: () => void
  onListo: () => void
}

const SUGERIDO_DM = 'Hola! Vi que comentaste en el reel. Te armé la ficha completa de la propiedad, con fotos y todos los detalles. ¿Te la paso?'
const SUGERIDO_SEGUIMIENTO = 'Acá la tenés 👇'

async function leerJson<T>(res: Response): Promise<T> {
  const texto = await res.text()
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new Error('El servidor tardó demasiado en responder. Probá de nuevo.')
  }
}

export function ConfigurarReelDialog({ propertyId, reelId, landingPublicada, onCerrar, onListo }: Props) {
  const [reel, setReel] = useState<ReelCompleto | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!reelId) return
    // Se limpia ANTES de pedir: si no, al abrir otro reel se ven los textos del
    // anterior mientras carga, y lo que se llegue a tipear en ese lapso lo pisa
    // la respuesta que viene en camino.
    setReel(null)
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/reels`)
      const cuerpo = await leerJson<{ reels?: ReelCompleto[]; error?: string }>(res)
      if (!res.ok) throw new Error(cuerpo.error || 'No se pudo cargar el reel')
      const encontrado = (cuerpo.reels ?? []).find((r) => r.id === reelId) ?? null
      if (!encontrado) throw new Error('No se encontró el reel')
      setReel({
        ...encontrado,
        dm_texto: encontrado.dm_texto ?? SUGERIDO_DM,
        dm_seguimiento: encontrado.dm_seguimiento ?? SUGERIDO_SEGUIMIENTO,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [propertyId, reelId])

  useEffect(() => { if (reelId) void cargar() }, [reelId, cargar])

  const guardar = async () => {
    if (!reel) return
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/reels/${reel.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          descripcion: reel.descripcion,
          palabra_clave: reel.palabra_clave,
          dm_texto: reel.dm_texto,
          dm_boton: reel.dm_boton,
          dm_seguimiento: reel.dm_seguimiento,
          automatizacion_activa: reel.automatizacion_activa,
          simulacro: reel.simulacro,
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar el reel</DialogTitle>
          <DialogDescription>
            Qué palabras se reconocen y qué se le responde a quien escriba alguna.
          </DialogDescription>
        </DialogHeader>

        {cargando && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Cargando…
          </p>
        )}

        {reel && (
          <div className="space-y-4">
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

            <div className="space-y-1.5">
              <Label htmlFor="cfg-dm">Mensaje privado</Label>
              <Textarea
                id="cfg-dm"
                rows={4}
                maxLength={1000}
                value={reel.dm_texto ?? ''}
                disabled={guardando}
                onChange={(e) => editar({ dm_texto: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-boton">Texto del botón</Label>
              <Input
                id="cfg-boton"
                value={reel.dm_boton}
                maxLength={20}
                disabled={guardando}
                onChange={(e) => editar({ dm_boton: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Hasta 20 caracteres: Instagram rechaza el mensaje entero si se pasa.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-seguimiento">Mensaje que acompaña al enlace</Label>
              <Input
                id="cfg-seguimiento"
                value={reel.dm_seguimiento ?? ''}
                maxLength={200}
                disabled={guardando}
                onChange={(e) => editar({ dm_seguimiento: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Se manda cuando la persona toca el botón, junto con el enlace de la landing.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-simulacro" className="text-sm">Modo simulacro</Label>
                  <p className="text-xs text-muted-foreground">
                    Registra lo que <strong>habría</strong> hecho, sin escribirle a nadie.
                  </p>
                </div>
                <Switch
                  id="cfg-simulacro"
                  checked={reel.simulacro}
                  disabled={guardando}
                  onCheckedChange={(v) => editar({ simulacro: v })}
                />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="cfg-automatizacion" className="text-sm">Automatización</Label>
                  <p className="text-xs text-muted-foreground">
                    Solo actúa sobre los comentarios nuevos, desde el momento en que se activa.
                  </p>
                </div>
                {/*
                  Se bloquea solo para ENCENDER. Apagar tiene que poder hacerse
                  siempre: si la landing se despublica mientras el reel está
                  respondiendo solo, bloquear el interruptor dejaba al asesor sin
                  forma de frenarlo — justo cuando más falta hace.
                */}
                <Switch
                  id="cfg-automatizacion"
                  checked={reel.automatizacion_activa}
                  disabled={guardando || (!landingPublicada && !reel.automatizacion_activa)}
                  onCheckedChange={(v) => editar({ automatizacion_activa: v })}
                />
              </div>

              {/* La misma regla que la ruta: activo sin palabras no se guarda.
                  Avisarlo acá evita el clic que el servidor igual rechazaría. */}
              {reel.automatizacion_activa && separarPalabras(reel.palabra_clave).length === 0 && (
                <p className="text-xs text-destructive">
                  Para dejar la automatización activa hace falta al menos una palabra.
                </p>
              )}
              {!landingPublicada && !reel.automatizacion_activa && (
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  Para activarla hace falta la landing publicada: es el enlace que recibe la persona.
                </p>
              )}
              {!landingPublicada && reel.automatizacion_activa && (
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  Este reel está respondiendo solo pero la landing no está publicada: quien toque
                  el botón no va a recibir nada. Publicá la landing o apagá la automatización.
                </p>
              )}
            </div>
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
          <Button onClick={() => void guardar()} disabled={
              !reel || guardando || !palabrasSonValidas(reel.palabra_clave ?? '') ||
              (reel.automatizacion_activa && separarPalabras(reel.palabra_clave).length === 0)
            }>
            {guardando && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

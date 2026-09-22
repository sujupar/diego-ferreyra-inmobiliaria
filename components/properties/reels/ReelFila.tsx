'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { etiquetaEstado, puedeCancelar, puedePedirPublicacion, puedeReintentar, type EstadoReel } from '@/lib/social/reels/estados'
import { AlertTriangle, ExternalLink, Loader2, MessageCircle, Send, Video } from 'lucide-react'
import { separarPalabras } from '@/lib/social/reels/palabra-clave'
import { ETIQUETA_MODO, modoDelReel, type ModoReel } from '@/lib/social/reels/modo'

export interface ReelVisible {
  id: string
  origen: 'subido' | 'existente'
  estado: EstadoReel
  palabra_clave: string | null
  programado_para: string | null
  ig_permalink: string | null
  ultimo_error: string | null
  automatizacion_activa: boolean
  simulacro: boolean
  created_at: string
}

export interface ContadoresVisibles {
  coincidencias: number
  privadosEnviados: number
  botonesTocados: number
}

interface Props {
  reel: ReelVisible
  contadores?: ContadoresVisibles
  puedeGestionar: boolean
  ocupado: boolean
  onPublicar: (reelId: string) => void
  onCancelar: (reelId: string) => void
  onConfigurar: (reelId: string) => void
}

/** Fecha en castellano, legible. Nunca la marca cruda de la base. */
function fechaLegible(iso: string | null): string {
  if (!iso) return ''
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleString('es-AR', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })
}

function colorModo(modo: ModoReel): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (modo === 'en_vivo') return 'default'
  if (modo === 'prueba') return 'secondary'
  return 'outline'
}

function colorEstado(estado: EstadoReel): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (estado === 'publicado') return 'default'
  if (estado === 'fallido') return 'destructive'
  if (estado === 'procesando' || estado === 'programado') return 'secondary'
  return 'outline'
}

export function ReelFila({
  reel, contadores, puedeGestionar, ocupado, onPublicar, onCancelar, onConfigurar,
}: Props) {
  const palabras = separarPalabras(reel.palabra_clave)
  const modo = modoDelReel(reel)
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Video className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />

        {/* Un reel que ya está en Instagram muestra su MODO, no "Publicado": el
            dueño leyó "Publicado" como "ya está respondiendo" (2026-09-22). */}
        {reel.estado === 'publicado' ? (
          <Badge variant={colorModo(modo)} className="text-[10px] h-5">{ETIQUETA_MODO[modo]}</Badge>
        ) : (
          <Badge variant={colorEstado(reel.estado)} className="text-[10px] h-5">
            {etiquetaEstado(reel.estado)}
          </Badge>
        )}

        {palabras.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {palabras.length === 1 ? 'palabra' : 'palabras'}:{' '}
            <strong className="text-foreground">{palabras.join(' · ')}</strong>
          </span>
        ) : (
          <span className="text-xs text-amber-700 dark:text-amber-500">Sin palabra configurada</span>
        )}


        <span className="ml-auto text-xs text-muted-foreground">
          {reel.estado === 'programado' && reel.programado_para
            ? `Se publica el ${fechaLegible(reel.programado_para)}`
            : fechaLegible(reel.created_at)}
        </span>
      </div>

      {contadores && reel.estado === 'publicado' && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" aria-hidden />
            {contadores.coincidencias} con alguna palabra
          </span>
          <span className="inline-flex items-center gap-1">
            <Send className="h-3 w-3" aria-hidden />
            {contadores.privadosEnviados} privados
          </span>
          <span>{contadores.botonesTocados} tocaron el botón</span>
        </div>
      )}

      {reel.ultimo_error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {reel.ultimo_error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {reel.ig_permalink && (
          <Button size="sm" variant="outline" asChild>
            <a href={reel.ig_permalink} target="_blank" rel="noopener noreferrer">
              Ver en Instagram <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
            </a>
          </Button>
        )}

        {puedeGestionar && (
          <>
            <Button size="sm" variant="outline" onClick={() => onConfigurar(reel.id)} disabled={ocupado}>
              Configurar
            </Button>

            {reel.origen === 'subido' && puedePedirPublicacion(reel.estado) && (
              <Button size="sm" onClick={() => onPublicar(reel.id)} disabled={ocupado}>
                {ocupado && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
                {puedeReintentar(reel.estado) ? 'Reintentar' : 'Publicar'}
              </Button>
            )}

            {puedeCancelar(reel.estado) && (
              <Button size="sm" variant="ghost" onClick={() => onCancelar(reel.id)} disabled={ocupado}>
                Cancelar
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

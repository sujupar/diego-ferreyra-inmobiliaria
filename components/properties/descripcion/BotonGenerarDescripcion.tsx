'use client'

/**
 * Botón "Generar / Regenerar descripción". Pregunta al servidor qué le falta a
 * la propiedad (fotos, datos) y, si falta algo, queda deshabilitado diciendo
 * exactamente qué — generar con dos fotos devuelve el texto genérico que se
 * quiso dejar atrás. Si el servidor dice que esta persona no puede (403, el
 * abogado), no se muestra.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EstadoDescripcion } from '@/lib/descripcion/servicio'
import type { TextoGenerado } from '@/lib/descripcion/tipos'
import { GenerarDescripcionPanel } from './GenerarDescripcionPanel'

export function BotonGenerarDescripcion({
  propertyId,
  tieneDescripcion,
  onGuardado,
}: {
  propertyId: string
  tieneDescripcion: boolean
  onGuardado: (t: TextoGenerado) => void
}) {
  const [estado, setEstado] = useState<EstadoDescripcion | null>(null)
  const [oculto, setOculto] = useState(false)
  const [errorEstado, setErrorEstado] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/descripcion`)
      if (res.status === 403) { setOculto(true); return }
      const json = (await res.json().catch(() => null)) as (EstadoDescripcion & { error?: string }) | null
      if (!res.ok || !json) { setErrorEstado(json?.error ?? 'No se pudo revisar la propiedad.'); return }
      setErrorEstado(null)
      setEstado(json)
    } catch {
      setErrorEstado('No se pudo revisar la propiedad.')
    }
  }, [propertyId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- solo dispara el pedido; el estado cambia recién cuando vuelve la respuesta
    void cargar()
  }, [cargar])

  if (oculto) return null
  const faltan = estado?.faltan ?? []
  const etiqueta = tieneDescripcion ? 'Regenerar descripción' : 'Generar descripción'

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant={tieneDescripcion ? 'outline' : 'default'}
        onClick={() => setAbierto(true)}
        disabled={!estado || faltan.length > 0}
      >
        {!estado && !errorEstado ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
        {etiqueta}
      </Button>
      {faltan.length > 0 && <p className="text-xs text-muted-foreground">Falta: {faltan.join(', ')}.</p>}
      {errorEstado && (
        <p className="text-xs text-red-600">
          {errorEstado} <button type="button" className="underline" onClick={() => { setErrorEstado(null); void cargar() }}>Reintentar</button>
        </p>
      )}
      {estado && (
        <GenerarDescripcionPanel
          propertyId={propertyId}
          estado={estado}
          abierto={abierto}
          onCerrar={() => setAbierto(false)}
          onGuardado={t => { onGuardado(t); void cargar() }}
        />
      )}
    </div>
  )
}

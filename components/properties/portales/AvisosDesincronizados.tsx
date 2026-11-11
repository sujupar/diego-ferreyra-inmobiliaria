'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SincronizarPortalesDialog } from './SincronizarPortalesDialog'
import { leerCuerpo, lineasFranja, parsearFilas } from './sincronizar-estado'

/**
 * Franja arriba de la ficha: avisa si un aviso publicado ya no coincide con la
 * ficha. Si el servidor responde 403 o falla, no muestra nada (nunca un error).
 */
export function AvisosDesincronizados({ propertyId, onChanged }: { propertyId: string; onChanged: () => void }) {
  const [lineas, setLineas] = useState<{ portal: string; texto: string }[]>([])
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/properties/${propertyId}/portales/diferencias`)
      const cuerpo = leerCuerpo(r.status, await r.text())
      setLineas(r.ok ? lineasFranja(parsearFilas(cuerpo)) : [])
    } catch {
      setLineas([])
    }
  }, [propertyId])

  // Carga al montar (lectura de red); el setState ocurre después del await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar() }, [cargar])

  const cerrar = useCallback(() => {
    setAbierto(false)
    void cargar()
    onChanged()
  }, [cargar, onChanged])

  if (lineas.length === 0 && !abierto) return null
  return (
    <>
      {lineas.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              {lineas.map(l => <p key={l.portal}>{l.texto}</p>)}
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-10 sm:h-8" onClick={() => setAbierto(true)}>Revisar</Button>
        </div>
      )}
      <SincronizarPortalesDialog propertyId={propertyId} abierto={abierto} onCerrar={cerrar} />
    </>
  )
}

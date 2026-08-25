'use client'
/**
 * Corregir la ubicación de una propiedad desde su ficha, eligiéndola del
 * catálogo de Argenprop en vez de escribirla.
 *
 * Existe porque una propiedad mal cargada no se podía arreglar de ninguna
 * manera desde la plataforma: el 2026-08-24 "Rogelio Vidal 6136" quedó sin
 * provincia (el alta nunca la pregunta) y no había forma de publicarla en
 * Argenprop sin tocar la base a mano.
 *
 * Usa el endpoint dedicado `PATCH /api/properties/[id]/location`, NO el `PUT`
 * genérico: aquel crea tareas y manda mails al pasar a `pending_review`.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, MapPin, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LocationPicker } from '../LocationPicker'
import type { SeleccionUbicacion } from '@/lib/properties/location-selection'

interface Props {
  propertyId: string
  address: string
  neighborhood: string
  city: string
  province?: string | null
  /** true si la ubicación ya se eligió del catálogo (hay identificadores guardados). */
  elegidaDelCatalogo: boolean
  onChanged: () => void
}

async function leerJson(res: Response): Promise<Record<string, unknown>> {
  const texto = await res.text()
  try { return JSON.parse(texto) as Record<string, unknown> } catch { return {} }
}

export function PropertyLocationEditor({
  propertyId, address, neighborhood, city, province, elegidaDelCatalogo, onChanged,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const [seleccion, setSeleccion] = useState<SeleccionUbicacion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [sinCatalogo, setSinCatalogo] = useState(false)

  async function guardar() {
    if (!seleccion) return
    setGuardando(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/location`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seleccion }),
      })
      const data = await leerJson(res)
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo guardar la ubicación.')
      toast.success('Ubicación actualizada')
      setAbierto(false)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la ubicación.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mb-3">
      <p className="text-sm text-muted-foreground">
        {[address, neighborhood, city, province].filter(Boolean).join(' · ')}
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        {elegidaDelCatalogo ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Check className="h-3 w-3" />Ubicación lista para publicar
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
            <MapPin className="h-3 w-3" />Elegí la ubicación de la lista para poder publicar
          </span>
        )}
        {!abierto && (
          <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            {elegidaDelCatalogo ? 'Cambiar ubicación' : 'Elegir ubicación'}
          </Button>
        )}
      </div>

      {abierto && (
        <div className="mt-3 rounded-xl border bg-card p-4">
          <p className="eyebrow mb-3">Elegir ubicación</p>

          {sinCatalogo ? (
            <p className="text-sm text-[color:var(--destructive)]">
              No se pudo traer la lista de ubicaciones de Argenprop. Probá de nuevo en un rato;
              mientras tanto la propiedad queda como está.
            </p>
          ) : (
            <LocationPicker
              pista={{ province, city, neighborhood }}
              onChange={setSeleccion}
              onCatalogoNoDisponible={() => setSinCatalogo(true)}
              disabled={guardando}
            />
          )}

          <div className="flex items-center gap-2 mt-4">
            <Button size="sm" onClick={guardar} disabled={!seleccion || guardando}>
              {guardando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Guardar ubicación
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            La dirección (calle y altura) se edita aparte. Esto define provincia, partido,
            localidad y barrio, que es lo que los portales necesitan para publicar.
          </p>
        </div>
      )}
    </div>
  )
}

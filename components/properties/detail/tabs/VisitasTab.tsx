'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RegaloDeLaEncuesta } from '@/components/visitas/encuesta/RegaloDeLaEncuesta'
import { FilaVisita } from '@/components/visitas/seccion/FilaVisita'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { separarProximasYPasadas } from '@/lib/visitas/resumen'
import { TEXTO_LLEGA_CON_LA_ENCUESTA } from '@/lib/visitas/presentacion'
import type { VisitaListado } from '@/lib/visitas/tipos'

export const MAX_VISITAS_PESTANA = 200

type Estado = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; visitas: VisitaListado[] }

/**
 * Pestaña "Visitas" de la ficha de la propiedad (spec §3.5). Lee GET /api/visits con el
 * filtro de la propiedad: el alcance por rol lo aplica la ruta (un asesor ve las suyas).
 * "Qué opinan los que visitaron" llega con la encuesta (Entrega 3).
 */
export function VisitasTab({ propertyId, mostrarAsesor }: { propertyId: string; mostrarAsesor: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- al montar el estado inicial YA es 'cargando'; esto solo dispara el pedido (lo mismo pasa al cambiar de propiedad o al reintentar, que vuelven a pasar por acá)
    setEstado({ tipo: 'cargando' })
    fetch(`/api/visits?propiedad=${encodeURIComponent(propertyId)}&porPagina=${MAX_VISITAS_PESTANA}`)
      .then(r => leerRespuesta<VisitaListado[]>(r))
      .then(r => {
        if (!vigente) return
        setEstado(r.ok ? { tipo: 'listo', visitas: r.data ?? [] } : { tipo: 'error', mensaje: r.error })
      })
      .catch(() => { if (vigente) setEstado({ tipo: 'error', mensaje: 'No hay conexión. Probá de nuevo.' }) })
    return () => { vigente = false }
  }, [propertyId, intento])

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Compradores</p>
        <h2 className="display mt-1 text-xl">Visitas</h2>
      </div>

      <RegaloDeLaEncuesta propertyId={propertyId} />

      {estado.tipo === 'cargando' && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {estado.tipo === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{estado.mensaje}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setIntento(n => n + 1)}>Reintentar</Button>
        </div>
      )}
      {estado.tipo === 'listo' && <Listas visitas={estado.visitas} mostrarAsesor={mostrarAsesor} />}

      <section aria-labelledby="opinan-propiedad" className="space-y-2 rounded-xl border bg-card p-4">
        <h3 id="opinan-propiedad" className="text-base font-semibold">Qué opinan los que visitaron</h3>
        <p className="text-sm text-muted-foreground">{TEXTO_LLEGA_CON_LA_ENCUESTA}</p>
      </section>
    </div>
  )
}

// Componente de MÓDULO, no declarado dentro de VisitasTab: ver CLAUDE.md
// § "NUNCA declarar un componente dentro de otro" — un cambio de estado del
// padre remonta cualquier componente definido en su render.
function Listas({ visitas, mostrarAsesor }: { visitas: VisitaListado[]; mostrarAsesor: boolean }) {
  if (visitas.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay visitas en esta propiedad.</p>
  const { proximas, pasadas } = separarProximasYPasadas(visitas, new Date())
  return (
    <>
      {[{ titulo: 'Próximas', lista: proximas }, { titulo: 'Pasadas', lista: pasadas }].map(({ titulo, lista }) => (
        <section key={titulo} aria-labelledby={`visitas-${titulo}`} className="space-y-2">
          <h3 id={`visitas-${titulo}`} className="text-base font-semibold">{titulo} ({lista.length})</h3>
          {lista.length === 0
            ? <p className="text-sm text-muted-foreground">Ninguna.</p>
            : <ul className="space-y-2">{lista.map(v => <FilaVisita key={v.id} visita={v} mostrarAsesor={mostrarAsesor} mostrarPropiedad={false} />)}</ul>}
        </section>
      ))}
      {visitas.length >= MAX_VISITAS_PESTANA && (
        <p className="text-sm text-muted-foreground">Se muestran las {MAX_VISITAS_PESTANA} más recientes. Las demás están en Visitas → Ver todas.</p>
      )}
    </>
  )
}

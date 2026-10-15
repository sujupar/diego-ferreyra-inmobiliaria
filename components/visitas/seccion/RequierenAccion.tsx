'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AccionVisitaDialog } from '@/components/visitas/ficha/AccionVisitaDialog'
import { FilaVisita } from './FilaVisita'
import type { RequierenAccion as Pendientes } from '@/lib/visitas/resumen'
import type { VisitaListado } from '@/lib/visitas/tipos'
import type { TipoAccion } from '@/lib/visitas/transiciones'

const DE_UNA_PASADA: ReadonlyArray<{ accion: TipoAccion; texto: string; principal: boolean }> = [
  { accion: 'realizada', texto: 'Se realizó', principal: true },
  { accion: 'no_realizada', texto: 'No se realizó', principal: false },
  { accion: 'reprogramar', texto: 'Reprogramar', principal: false },
]
const DE_UNA_A_CONFIRMAR: ReadonlyArray<{ accion: TipoAccion; texto: string; principal: boolean }> = [
  { accion: 'confirmar', texto: 'Confirmar', principal: true },
]

/**
 * Lo que hay que resolver (spec §3.4): visitas que pasaron sin resultado, visitas a
 * confirmar y encuestas sin responder hace más de 48 h, con la acción AHÍ MISMO (la
 * misma ventana que la ficha; el servidor valida la transición y la versión). Al
 * terminar, `onCambio` hace que la pantalla vuelva a pedir el resumen: así la visita
 * sale de la lista y suma donde corresponde (criterio 14).
 */
export function RequierenAccion({ requieren, mostrarAsesor, onCambio }: { requieren: Pendientes; mostrarAsesor: boolean; onCambio: () => void }) {
  const [abierta, setAbierta] = useState<{ visita: VisitaListado; accion: TipoAccion } | null>(null)
  const mostradas = requieren.sinResultado.length + requieren.aConfirmar.length + requieren.encuestasSinResponder.length

  function botones(visita: VisitaListado, lista: typeof DE_UNA_PASADA) {
    return lista.map(b => (
      <Button
        key={b.accion}
        type="button"
        variant={b.principal ? 'default' : 'outline'}
        className={`min-h-11 ${b.principal ? 'bg-brand text-brand-foreground hover:bg-brand/90' : ''}`}
        onClick={() => setAbierta({ visita, accion: b.accion })}
      >
        {b.texto}
      </Button>
    ))
  }

  return (
    <section aria-labelledby="requieren-titulo" className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <h2 id="requieren-titulo" className="text-lg font-semibold">
        Requieren tu acción{requieren.total > 0 ? ` (${requieren.total})` : ''}
      </h2>
      {requieren.total === 0 && <p className="text-sm text-muted-foreground">No hay nada para resolver.</p>}
      {requieren.sinResultado.length > 0 && (
        <div className="space-y-2">
          <h3 className="eyebrow">Pasaron sin resultado</h3>
          <ul className="space-y-2">
            {requieren.sinResultado.map(v => (
              <FilaVisita key={v.id} visita={v} mostrarAsesor={mostrarAsesor}>{botones(v, DE_UNA_PASADA)}</FilaVisita>
            ))}
          </ul>
        </div>
      )}
      {requieren.aConfirmar.length > 0 && (
        <div className="space-y-2">
          <h3 className="eyebrow">A confirmar</h3>
          <ul className="space-y-2">
            {requieren.aConfirmar.map(v => (
              <FilaVisita key={v.id} visita={v} mostrarAsesor={mostrarAsesor}>{botones(v, DE_UNA_A_CONFIRMAR)}</FilaVisita>
            ))}
          </ul>
        </div>
      )}
      {requieren.encuestasSinResponder.length > 0 && (
        <div className="space-y-2">
          <h3 className="eyebrow">Encuestas sin responder hace más de 48 h</h3>
          <ul className="space-y-2">
            {requieren.encuestasSinResponder.map(v => (
              // Sin botones: copiar o reenviar se hace desde la ficha (la fila lleva ahí).
              <FilaVisita key={v.id} visita={v} mostrarAsesor={mostrarAsesor} />
            ))}
          </ul>
        </div>
      )}
      {requieren.total > mostradas && (
        <p className="text-sm text-muted-foreground">Se muestran las primeras {mostradas} de {requieren.total}. Las demás están en “Ver todas”.</p>
      )}
      {abierta && (
        <AccionVisitaDialog
          visita={abierta.visita}
          accion={abierta.accion}
          onClose={() => setAbierta(null)}
          onHecho={() => onCambio()}
          onRecargar={onCambio}
        />
      )}
    </section>
  )
}

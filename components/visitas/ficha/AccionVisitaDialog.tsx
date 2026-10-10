'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SelectorDiaHora } from '@/components/visitas/SelectorDiaHora'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { MOTIVOS_NO_REALIZADA, MOTIVO_ETIQUETA, INTERESES, INTERES_ETIQUETA, type TipoAccion, type MotivoNoRealizada, type Interes } from '@/lib/visitas/transiciones'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import type { VisitaDetalle, EventoVisitaR } from '@/lib/visitas/tipos'

export type VisitaConHistorial = VisitaDetalle & { eventos: EventoVisitaR[]; acciones: TipoAccion[] }

const TITULO: Record<TipoAccion, string> = {
  confirmar: 'Confirmar visita', reprogramar: 'Reprogramar', cancelar: 'Cancelar visita',
  realizada: 'Se realizó', no_realizada: 'No se realizó', cambiar_asesor: 'Cambiar asesor', reabrir: 'Reabrir visita',
}

export function AccionVisitaDialog({ visita, accion, onClose, onHecho, onRecargar }: {
  visita: VisitaConHistorial
  accion: TipoAccion | null
  onClose: () => void
  onHecho: (v: VisitaConHistorial) => void
  /** Se llama cuando el servidor guardó pero no se pudo releer la visita (`data: null`),
   *  y también desde el botón "Recargar" de un 409 por cambio concurrente: en los dos
   *  casos la pantalla tiene que volver a pedir `/api/visits/[id]` para saber cómo quedó. */
  onRecargar: () => void
}) {
  const [motivo, setMotivo] = useState<MotivoNoRealizada | null>(null)
  const [detalle, setDetalle] = useState('')
  const [interes, setInteres] = useState<Interes | null>(null)
  const [notas, setNotas] = useState('')
  const [fecha, setFecha] = useState<string | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  const [asesorId, setAsesorId] = useState<string>('')
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [conflicto, setConflicto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Cada vez que se abre con otra acción, arranca limpio: un motivo elegido para
  // "Cancelar" no puede quedar marcado al abrir "No se realizó".
  useEffect(() => {
    setMotivo(null); setDetalle(''); setInteres(null); setNotas('')
    setFecha(null); setHora(null); setAsesorId(''); setError(null); setConflicto(false)
  }, [accion])

  useEffect(() => {
    if (accion !== 'cambiar_asesor' || asesores.length > 0) return
    let vigente = true
    fetch('/api/users/advisors').then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (vigente && r.ok) setAsesores(r.data ?? []) })
    return () => { vigente = false }
  }, [accion, asesores.length])

  function cuerpo(): Record<string, unknown> | string {
    switch (accion) {
      case 'confirmar': return { tipo: 'confirmar' }
      case 'realizada': return { tipo: 'realizada', interes, notas }
      case 'no_realizada':
      case 'cancelar':
        if (!motivo) return 'Elegí un motivo'
        if (motivo === 'otro' && detalle.trim().length < 3) return 'Contanos el motivo'
        return { tipo: accion, motivo, detalle }
      case 'reprogramar':
        if (!fecha || !hora) return 'Elegí el nuevo día y la hora'
        return { tipo: 'reprogramar', fecha, hora }
      case 'cambiar_asesor':
        if (!asesorId) return 'Elegí el asesor'
        return { tipo: 'cambiar_asesor', asesorId }
      case 'reabrir':
        if (detalle.trim().length < 3) return 'Contanos por qué la reabrís'
        return { tipo: 'reabrir', motivo: detalle }
      default: return 'Acción desconocida'
    }
  }

  async function guardar() {
    const b = cuerpo()
    if (typeof b === 'string') { setError(b); return }
    setGuardando(true); setError(null); setConflicto(false)
    try {
      // `version` viaja EXACTAMENTE como lo vio el GET (string tal cual, sin
      // re-serializar con `new Date().toISOString()`): la ruta la compara como
      // texto contra `updated_at`, y re-serializar cambiaría microsegundos/
      // formato y daría 409 en TODAS las acciones, no solo ante un cambio real.
      const r = await leerRespuesta<VisitaConHistorial | null>(await fetch(`/api/visits/${visita.id}/estado`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...b, version: visita.updated_at }),
      }))
      if (!r.ok) {
        setError(r.error)
        if (r.cuerpo.code === 'CAMBIO_CONCURRENTE') setConflicto(true)
        return
      }
      toast.success('Listo')
      // La escritura ya se hizo; si el servidor no pudo releer la visita manda
      // `data: null` en un 200 (no es un error). Ahí no hay fila nueva para
      // pintar: se cierra y se recarga en vez de pasarle `null` a `onHecho`.
      if (r.data) { onHecho(r.data); onClose() }
      else { onClose(); onRecargar() }
    } finally {
      setGuardando(false)
    }
  }

  const opcion = (activa: boolean) => `flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left ${activa ? 'border-2 border-brand bg-brand-soft/40 font-semibold' : 'bg-card'}`

  return (
    <Dialog open={accion !== null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{accion ? TITULO[accion] : ''}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {accion === 'confirmar' && <p className="text-sm">¿La persona confirmó que viene?</p>}
          {accion === 'realizada' && (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">¿Cómo viste el interés?</legend>
                {INTERESES.map(i => (
                  <button key={i} type="button" role="radio" aria-checked={interes === i} onClick={() => setInteres(i)} className={opcion(interes === i)}>
                    {INTERES_ETIQUETA[i]}
                  </button>
                ))}
              </fieldset>
              <label className="block space-y-1 text-sm"><span>Notas (opcional)</span>
                <textarea value={notas} maxLength={1000} onChange={e => setNotas(e.target.value)} className="min-h-20 w-full rounded-lg border bg-card px-3 py-2 text-base" />
              </label>
            </>
          )}
          {(accion === 'no_realizada' || accion === 'cancelar') && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">¿Por qué?</legend>
              {MOTIVOS_NO_REALIZADA.map(m => (
                <button key={m} type="button" role="radio" aria-checked={motivo === m} onClick={() => setMotivo(m)} className={opcion(motivo === m)}>
                  {MOTIVO_ETIQUETA[m]}
                </button>
              ))}
              {motivo === 'otro' && (
                <input value={detalle} maxLength={500} onChange={e => setDetalle(e.target.value)} placeholder="Contanos el motivo"
                  className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
              )}
            </fieldset>
          )}
          {accion === 'reprogramar' && (
            <SelectorDiaHora hoy={fechaEnArgentina(new Date())} fecha={fecha} hora={hora} onFecha={setFecha} onHora={setHora} avisos={[]} />
          )}
          {accion === 'cambiar_asesor' && (
            <div role="radiogroup" aria-label="Asesor" className="space-y-2">
              {asesores.filter(a => a.id !== visita.advisor_id).map(a => (
                <button key={a.id} type="button" role="radio" aria-checked={asesorId === a.id} onClick={() => setAsesorId(a.id)} className={opcion(asesorId === a.id)}>
                  {a.full_name}
                </button>
              ))}
            </div>
          )}
          {accion === 'reabrir' && (
            <label className="block space-y-1 text-sm"><span>¿Por qué la reabrís?</span>
              <input value={detalle} maxLength={500} onChange={e => setDetalle(e.target.value)} className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
            </label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Volver</Button>
          {conflicto && (
            <Button variant="outline" onClick={() => { onClose(); onRecargar() }}>Recargar</Button>
          )}
          <Button onClick={guardar} disabled={guardando} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

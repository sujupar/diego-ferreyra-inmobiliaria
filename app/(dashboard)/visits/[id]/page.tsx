'use client'

/**
 * Ficha de una visita (spec §3.3): quién, cuándo, de dónde vino, en qué etapa
 * está, qué se puede hacer AHORA (lo calcula el servidor con su hora) y todo lo
 * que pasó (historial que escribe el trigger de la base).
 *
 * Garantías heredadas de la ficha anterior, fijadas por sus tests: nunca queda
 * en "Cargando…" (404, error y cuerpo no-JSON tienen su pantalla); el link de
 * vuelta existe en todos los estados; en celular el título y el estado se
 * apilan, el teléfono y el mail se tocan, y la acción principal ocupa el ancho.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AccionVisitaDialog, type VisitaConHistorial } from '@/components/visitas/ficha/AccionVisitaDialog'
import { LineaDeTiempo } from '@/components/visitas/ficha/LineaDeTiempo'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import { ORIGEN_INFO } from '@/lib/visitas/origen'
import { ESTADO_ETIQUETA, MOTIVO_ETIQUETA, INTERES_ETIQUETA, type TipoAccion, type EstadoVisita } from '@/lib/visitas/transiciones'
import { cn } from '@/lib/utils'

type Fase =
  | { tipo: 'cargando' }
  | { tipo: 'no_encontrada' }
  | { tipo: 'error' }
  | { tipo: 'lista'; visita: VisitaConHistorial }

const TEXTO_ACCION: Record<TipoAccion, string> = {
  confirmar: 'Confirmar visita', realizada: 'Se realizó', no_realizada: 'No se realizó', reprogramar: 'Reprogramar',
  cancelar: 'Cancelar', cambiar_asesor: 'Cambiar asesor', reabrir: 'Reabrir',
}
/** Si ya pasó, lo primero es decir si se hizo; si no, confirmarla. */
const PRIORIDAD: TipoAccion[] = ['realizada', 'confirmar', 'reprogramar', 'reabrir']

const COLOR_ESTADO: Record<EstadoVisita, string> = {
  pending_confirmation: 'bg-amber-50 text-amber-900',
  scheduled: 'bg-brand-soft text-brand',
  completed: 'bg-emerald-50 text-emerald-900',
  no_show: 'bg-red-50 text-red-900',
  cancelled: 'bg-secondary text-muted-foreground',
}

function Volver() {
  return <Link href="/visits" className="text-sm text-muted-foreground hover:text-foreground">← Volver a visitas</Link>
}

const MARCO = 'w-full max-w-4xl mx-auto space-y-6 pb-10'

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [fase, setFase] = useState<Fase>({ tipo: 'cargando' })
  const [accion, setAccion] = useState<TipoAccion | null>(null)

  const cargar = useCallback(async () => {
    setFase({ tipo: 'cargando' })
    try {
      const r = await leerRespuesta<VisitaConHistorial | null>(await fetch(`/api/visits/${id}`))
      if (!r.ok) {
        if (r.status === 404) { setFase({ tipo: 'no_encontrada' }); return }
        console.error('[visita] no se pudo cargar:', r.error)
        setFase({ tipo: 'error' })
        return
      }
      if (!r.data) { console.error('[visita] la respuesta no trae la visita'); setFase({ tipo: 'error' }); return }
      setFase({ tipo: 'lista', visita: r.data })
    } catch (e) {
      console.error('[visita] no se pudo cargar:', e)
      setFase({ tipo: 'error' })
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- al montar el estado inicial YA es 'cargando'; esto solo dispara el pedido (lo mismo pasa al reintentar/recargar, que vuelven a pasar por acá)
    void cargar()
  }, [cargar])

  if (fase.tipo === 'cargando') {
    return <div className={MARCO}><Volver /><p className="text-sm text-muted-foreground">Cargando…</p></div>
  }
  if (fase.tipo === 'no_encontrada') {
    return (
      <div className={MARCO}>
        <Volver />
        <p className="font-medium">No encontramos esta visita</p>
        <Link href="/visits" className="text-sm text-brand">Ver todas las visitas</Link>
      </div>
    )
  }
  if (fase.tipo === 'error') {
    return (
      <div className={MARCO}>
        <Volver />
        <p className="font-medium">No pudimos cargar la visita</p>
        <Button variant="outline" onClick={() => void cargar()}>Reintentar</Button>
      </div>
    )
  }

  const v = fase.visita
  const principal = PRIORIDAD.find(a => v.acciones.includes(a)) ?? null
  const secundarias = v.acciones.filter(a => a !== principal)
  const telefono = v.client_phone?.trim() || null
  const email = v.client_email?.trim() || null

  return (
    <div className={MARCO}>
      <Volver />
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="break-words text-2xl font-semibold">{v.propiedad?.address ?? 'Visita'}</h1>
          <p className="text-sm text-muted-foreground">{formatearFechaLarga(v.scheduled_at)}</p>
        </div>
        <span className={cn('shrink-0 self-start rounded-full px-3 py-1 text-xs font-semibold', COLOR_ESTADO[v.status])}>
          {ESTADO_ETIQUETA[v.status]}
        </span>
      </header>

      {(principal || secundarias.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {principal && (
            <Button onClick={() => setAccion(principal)} className="max-md:w-full max-md:min-h-11 bg-brand text-brand-foreground hover:bg-brand/90">
              {TEXTO_ACCION[principal]}
            </Button>
          )}
          {secundarias.map(a => (
            <Button key={a} variant="outline" onClick={() => setAccion(a)} className="max-md:min-h-11">{TEXTO_ACCION[a]}</Button>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Persona</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">{v.client_name}</p>
            {telefono && (
              <a href={`tel:${telefono.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 text-brand max-md:min-h-11">
                <Phone className="h-4 w-4" aria-hidden="true" />{telefono}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-2 break-all text-brand max-md:min-h-11">
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{email}
              </a>
            )}
            {v.origin && (
              <p>Origen: {ORIGEN_INFO[v.origin].etiqueta}{v.origin_detail ? ` · ${v.origin_detail}` : ''}</p>
            )}
            {v.comprador && (
              <p className="text-muted-foreground">Comprador{v.comprador.lead_number ? ` #${v.comprador.lead_number}` : ''}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Visita</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Asesor: {v.asesor?.full_name ?? 'Sin asesor'}</p>
            {v.reschedule_count > 0 && <p>Reprogramada {v.reschedule_count} {v.reschedule_count === 1 ? 'vez' : 'veces'}</p>}
            {v.created_by_ai && <p className="text-muted-foreground">La propuso el agente de WhatsApp</p>}
            {v.notes && <p className="whitespace-pre-line text-muted-foreground">{v.notes}</p>}
            {v.outcome_reason && <p>Motivo: {MOTIVO_ETIQUETA[v.outcome_reason]}</p>}
            {v.advisor_interest && <p>Interés: {INTERES_ETIQUETA[v.advisor_interest]}</p>}
            {v.completion_notes && <p className="whitespace-pre-line">{v.completion_notes}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Historial</CardTitle></CardHeader>
        <CardContent><LineaDeTiempo eventos={v.eventos} /></CardContent>
      </Card>

      <AccionVisitaDialog
        visita={v}
        accion={accion}
        onClose={() => setAccion(null)}
        onHecho={nueva => setFase({ tipo: 'lista', visita: nueva })}
        onRecargar={() => void cargar()}
      />
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { SelectorDiaHora } from '@/components/visitas/SelectorDiaHora'
import { construirInstante, fechaEnArgentina } from '@/lib/visitas/horario'
import { avisosDeChoque } from '@/lib/visitas/choques'
import type { VisitaAgendaR } from '@/lib/visitas/tipos'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'

export function PasoCuando({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const [visitasDelDia, setVisitasDelDia] = useState<VisitaAgendaR[]>([])
  const propiedadId = estado.propiedad?.id ?? null

  useEffect(() => {
    if (!estado.fecha || !propiedadId) return
    let vigente = true
    const qs = new URLSearchParams({ fecha: estado.fecha, propiedad: propiedadId, ...(estado.asesorId ? { asesor: estado.asesorId } : {}) })
    fetch(`/api/visits/agenda-del-asesor?${qs}`).then(r => leerRespuesta<VisitaAgendaR[]>(r))
      .then(r => { if (vigente && r.ok) setVisitasDelDia(r.data) })
    return () => { vigente = false }
  }, [estado.fecha, estado.asesorId, propiedadId])

  const instante = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
  const avisos = instante && propiedadId
    ? avisosDeChoque({ instante, propiedadId, asesorId: estado.asesorId, visitas: visitasDelDia })
    : []

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">¿Cuándo?</h2>
        <p className="text-sm text-muted-foreground">Horario de Argentina. Te avisamos si el asesor ya tiene algo a esa hora.</p>
      </div>
      <SelectorDiaHora hoy={fechaEnArgentina(new Date())} fecha={estado.fecha} hora={estado.hora}
        onFecha={f => despachar({ tipo: 'elegirFecha', fecha: f })}
        onHora={h => despachar({ tipo: 'elegirHora', hora: h })} avisos={avisos} />
    </div>
  )
}

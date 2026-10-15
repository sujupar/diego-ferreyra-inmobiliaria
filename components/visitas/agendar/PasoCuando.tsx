'use client'
import { useEffect, useState } from 'react'
import { SelectorDiaHora } from '@/components/visitas/SelectorDiaHora'
import { construirInstante, fechaEnArgentina, validarHorarioDeVisita } from '@/lib/visitas/horario'
import { avisosDeChoque } from '@/lib/visitas/choques'
import type { VisitaAgendaR } from '@/lib/visitas/tipos'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'
import { CLASE_TITULO_PASO } from './titulo-paso'

export function PasoCuando({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const [visitasDelDia, setVisitasDelDia] = useState<VisitaAgendaR[]>([])
  const propiedadId = estado.propiedad?.id ?? null

  useEffect(() => {
    if (!estado.fecha || !propiedadId) return
    // Mientras se tipea la fecha a mano, el campo emite años a medio escribir
    // ("0002-10-13", "0020-10-13"…): visto en el QA, cada uno era un pedido que el
    // servidor rechazaba con 400. Solo se pide la agenda de un día que se podría
    // agendar (misma ventana que valida el servidor).
    if (!validarHorarioDeVisita(estado.fecha, '12:00').ok) return
    let vigente = true
    const qs = new URLSearchParams({ fecha: estado.fecha, propiedad: propiedadId, ...(estado.asesorId ? { asesor: estado.asesorId } : {}) })
    // Los avisos de choque son una AYUDA: si la agenda no se puede leer (red caída o
    // error del servidor), simplemente no aparecen — el servidor no bloquea por
    // choques. Pero el fallo queda en la consola y no deja una promesa sin atrapar.
    // Se vacía la lista para no avisar con la agenda de OTRO día ya leída antes.
    fetch(`/api/visits/agenda-del-asesor?${qs}`).then(r => leerRespuesta<VisitaAgendaR[]>(r))
      .then(r => {
        if (!vigente) return
        if (r.ok) { setVisitasDelDia(r.data); return }
        console.warn('[agendar] no se pudo leer la agenda del asesor:', r.status, r.error)
        setVisitasDelDia([])
      })
      .catch(e => {
        if (!vigente) return
        console.warn('[agendar] no se pudo leer la agenda del asesor:', e)
        setVisitasDelDia([])
      })
    return () => { vigente = false }
  }, [estado.fecha, estado.asesorId, propiedadId])

  const instante = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
  const avisos = instante && propiedadId
    ? avisosDeChoque({ instante, propiedadId, asesorId: estado.asesorId, visitas: visitasDelDia })
    : []

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 tabIndex={-1} className={CLASE_TITULO_PASO}>¿Cuándo?</h2>
        <p className="text-sm text-muted-foreground">Horario de Argentina. Te avisamos si el asesor ya tiene algo a esa hora.</p>
      </div>
      <SelectorDiaHora hoy={fechaEnArgentina(new Date())} fecha={estado.fecha} hora={estado.hora}
        onFecha={f => despachar({ tipo: 'elegirFecha', fecha: f })}
        onHora={h => despachar({ tipo: 'elegirHora', hora: h })} avisos={avisos} />
    </div>
  )
}

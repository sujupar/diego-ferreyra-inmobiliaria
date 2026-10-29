'use client'
import { useEffect, useState } from 'react'
import { SelectorDiaHora } from '@/components/visitas/SelectorDiaHora'
import { construirInstante, fechaEnArgentina, validarHorarioDeVisita } from '@/lib/visitas/horario'
import { avisosDeChoque } from '@/lib/visitas/choques'
import type { VisitaAgendaR } from '@/lib/visitas/tipos'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'
import { CLASE_TITULO_PASO } from './titulo-paso'

/** Lo que el armazón le pasa al paso cuando la ventana está en modo rápido. */
export interface DatosModoRapido {
  nombreAsesor: string | null
  puedeElegirAsesor: boolean
  onCambiarAsesor: () => void
}

/**
 * Modo rápido: arriba, quién viene, a qué propiedad y quién la muestra; abajo,
 * si ya está confirmada. Lo demás ya lo dijo la consulta.
 *
 * El teléfono NO se corrige acá: la sección Consultas lo revisa antes de abrir
 * la ventana. El formateado (`telefonoRapido.mostrado`) lo calcula el llamador
 * con `leerTelefono`, así libphonenumber no entra en este bundle; si no se pudo
 * leer, se muestra el texto tal cual.
 */
function ResumenRapido({ estado, datos }: { estado: EstadoAgendar; datos: DatosModoRapido }) {
  const persona = estado.persona
  const crudo = persona
    ? persona.tipo === 'nueva' ? persona.telefono : (estado.telefonoFaltante.trim() || persona.telefono)
    : null
  const mostrado = estado.telefonoRapido?.mostrado ?? (crudo?.trim() || null)
  return (
    <dl className="divide-y rounded-xl border bg-card text-sm">
      <div className="flex justify-between gap-4 px-4 py-3">
        <dt className="text-muted-foreground">Persona</dt>
        <dd className="min-w-0 text-right">
          <span className="block break-words font-medium">{persona?.nombre ?? '—'}</span>
          {mostrado && <span className="block text-muted-foreground">{mostrado}</span>}
        </dd>
      </div>
      <div className="flex justify-between gap-4 px-4 py-3">
        <dt className="text-muted-foreground">Propiedad</dt>
        <dd className="min-w-0 break-words text-right font-medium">{estado.propiedad?.address ?? '—'}</dd>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <dt className="text-muted-foreground">Asesor</dt>
        <dd className="flex min-w-0 items-center justify-end gap-2 text-right">
          <span className="break-words font-medium">{datos.nombreAsesor ?? 'Sin asesor'}</span>
          {datos.puedeElegirAsesor && (
            <button type="button" onClick={datos.onCambiarAsesor}
              className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-brand underline-offset-2 hover:underline">
              Cambiar<span className="sr-only"> el asesor</span>
            </button>
          )}
        </dd>
      </div>
    </dl>
  )
}

export function PasoCuando({ estado, despachar, rapido }: {
  estado: EstadoAgendar
  despachar: (a: AccionAgendar) => void
  /** Solo en modo rápido (`estado.rapido`): datos para la tarjeta de arriba. */
  rapido?: DatosModoRapido
}) {
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
      {estado.rapido && rapido && <ResumenRapido estado={estado} datos={rapido} />}
      <SelectorDiaHora hoy={fechaEnArgentina(new Date())} fecha={estado.fecha} hora={estado.hora}
        onFecha={f => despachar({ tipo: 'elegirFecha', fecha: f })}
        onHora={h => despachar({ tipo: 'elegirHora', hora: h })} avisos={avisos} />
      {estado.rapido && (
        <label className="flex min-h-11 items-center gap-3 rounded-lg border bg-card px-4 text-sm">
          <input type="checkbox" checked={estado.confirmada} className="h-5 w-5 accent-brand"
            onChange={e => despachar({ tipo: 'confirmada', valor: e.target.checked })} />
          <span>Ya la confirmé con la persona</span>
        </label>
      )}
    </div>
  )
}

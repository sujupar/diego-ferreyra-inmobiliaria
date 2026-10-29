'use client'

/**
 * "Agendar visita" desde una consulta: una máquina chica de hojas, en orden fijo.
 *   1. Elegir la propiedad (si la consulta no la tiene): se CONECTA en el
 *      servidor antes de seguir, porque `POST /api/visits` rechaza una consulta
 *      sin propiedad.
 *   2. Revisar o pedir el teléfono (si no sirve para WhatsApp): la ventana
 *      rápida no corrige teléfonos y bloquea el envío.
 *   3. La ventana de agendar en modo rápido (solo día y hora).
 *   4. "Visita agendada", con el botón para confirmarle por WhatsApp.
 * Las reglas de qué paso sigue viven en lib/consultas/agendar-desde-consulta.ts.
 */
import { useRef, useState } from 'react'
import { AgendarVisitaDialog } from '@/components/visitas/agendar/AgendarVisitaDialog'
import { inicioRapidoDe, nombreVisible } from '@/lib/consultas/pantalla'
import {
  pasoInicial, pasoTrasPropiedad, type PasoDesdeConsulta, type TelefonoAceptado,
} from '@/lib/consultas/agendar-desde-consulta'
import type { ConsultaEnBandeja } from '@/lib/consultas/tipos'
import { HojaElegirPropiedad, type PropiedadParaAgendar } from './HojaElegirPropiedad'
import { HojaRevisarTelefono } from './HojaRevisarTelefono'
import { HojaVisitaAgendada } from './HojaVisitaAgendada'

interface Visita { id: string; fecha: string; hora: string }

interface Props {
  consulta: ConsultaEnBandeja
  /** Admin, dueño o coordinador: los únicos que conectan un aviso con su propiedad. */
  puedeIdentificar: boolean
  /** Se agendó la visita y la persona tocó "Volver a consultas" (o cerró): re-pedir la bandeja. */
  onTerminado: (visita: Visita) => void
  /**
   * Se cerró sin agendar. `cambioLaConsulta`: ya se la había conectado con una
   * propiedad, así que la bandeja tiene que volver a pedirse aunque no haya visita.
   */
  onCerrar: (cambioLaConsulta: boolean) => void
}

export function AgendarDesdeConsulta({ consulta: c, puedeIdentificar, onTerminado, onCerrar }: Props) {
  const [paso, setPaso] = useState<PasoDesdeConsulta | 'listo'>(() => pasoInicial(c))
  const [propiedad, setPropiedad] = useState<PropiedadParaAgendar | null>(null)
  const [telefono, setTelefono] = useState<TelefonoAceptado | null>(null)
  const [visita, setVisita] = useState<Visita | null>(null)
  // La ventana de agendar avisa `onAgendada` y enseguida se cierra sola
  // (`onOpenChange(false)`) en el mismo tick, antes de que el estado nuevo se
  // pinte: sin esta marca, ese cierre se leería como "cancelar".
  const agendadaRef = useRef(false)

  const propiedadId = propiedad?.id ?? c.property_id
  const conectada = propiedad !== null
  const cerrar = () => onCerrar(conectada)

  if (paso === 'elegir_propiedad') {
    return (
      <HojaElegirPropiedad
        consulta={c}
        puedeIdentificar={puedeIdentificar}
        siguienteEsTelefono={pasoTrasPropiedad(c) === 'telefono'}
        onConectada={(p) => { setPropiedad(p); setPaso(pasoTrasPropiedad(c)) }}
        onCerrar={cerrar}
      />
    )
  }

  if (paso === 'telefono') {
    return (
      <HojaRevisarTelefono
        consulta={c}
        onUsar={(t) => { setTelefono(t); setPaso('agendar') }}
        onCerrar={cerrar}
      />
    )
  }

  if (paso === 'agendar' && propiedadId) {
    return (
      <AgendarVisitaDialog
        open
        onOpenChange={(o) => { if (!o && !agendadaRef.current) cerrar() }}
        propiedadId={propiedadId}
        silencioso
        rapido={inicioRapidoDe(c, telefono ? { telefono } : {})}
        onAgendada={(id, cuando) => {
          agendadaRef.current = true
          setVisita({ id, ...cuando })
          setPaso('listo')
        }}
      />
    )
  }

  // 'agendar' sin propiedad no debería pasar (pasoInicial lo evita); si pasa,
  // se vuelve a elegirla en vez de quedar con la pantalla vacía.
  if (paso === 'agendar' && !propiedadId) {
    return (
      <HojaElegirPropiedad
        consulta={c}
        puedeIdentificar={puedeIdentificar}
        siguienteEsTelefono={!telefono && pasoTrasPropiedad(c) === 'telefono'}
        onConectada={(p) => { setPropiedad(p); setPaso(telefono ? 'agendar' : pasoTrasPropiedad(c)) }}
        onCerrar={cerrar}
      />
    )
  }

  if (paso === 'listo' && visita) {
    const tel = telefono ?? (c.tel.ok ? c.tel : null)
    const direccion = propiedad?.address ?? c.propiedad?.address ?? 'la propiedad'
    const barrio = (propiedad?.neighborhood ?? c.propiedad?.neighborhood)?.trim()
    return (
      <HojaVisitaAgendada
        visita={visita}
        nombre={nombreVisible(c)}
        nombreParaSaludo={c.nombre}
        direccion={direccion}
        direccionMostrada={barrio ? `${direccion}, ${barrio}` : direccion}
        whatsapp={tel?.whatsapp ?? null}
        onVolver={() => onTerminado(visita)}
      />
    )
  }

  return null
}

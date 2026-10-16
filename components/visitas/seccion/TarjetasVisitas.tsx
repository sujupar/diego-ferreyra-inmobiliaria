import { StatTile } from '@/components/ui/StatTile'
import type { Metricas } from '@/lib/visitas/metricas'
import { textoPorcentaje, textoDeTiempo, textoDeBase } from '@/lib/visitas/presentacion'

const VISITAS = { uno: 'visita', varios: 'visitas' }
const CON_RESULTADO = { uno: 'con resultado', varios: 'con resultado' }

/** Las cinco tarjetas de la sección (spec §3.4). Cada número con su base (regla del tablero). */
export function TarjetasVisitas({ metricas: m, etiquetaPeriodo }: { metricas: Metricas; etiquetaPeriodo: string }) {
  const sinMarcar = m.sinMarcar > 0 ? ` · ${m.sinMarcar} sin marcar` : ''
  const { noRealizadas, canceladas } = m.conteos
  return (
    <div data-testid="tarjetas-visitas" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile
        label="Agendadas"
        value={m.agendadas.valor}
        context={m.agendadas.valor === null ? 'sin visitas en el período' : etiquetaPeriodo.toLowerCase()}
      />
      <StatTile
        label="Se realizaron"
        value={textoPorcentaje(m.realizadas)}
        context={m.realizadas.valor === null
          ? `ninguna con resultado todavía${sinMarcar}`
          : `${textoDeBase(m.realizadas, CON_RESULTADO)}${sinMarcar}`}
      />
      <StatTile
        label="No se hicieron"
        value={m.noSeHicieron.total.valor}
        context={m.noSeHicieron.total.valor === null
          ? 'sin visitas en el período'
          : `${noRealizadas} no se ${noRealizadas === 1 ? 'realizó' : 'realizaron'} · ${canceladas} ${canceladas === 1 ? 'cancelada' : 'canceladas'}`}
      />
      <StatTile
        label="Encuestas respondidas"
        value={textoPorcentaje(m.encuestas.respondidas)}
        context={m.encuestas.respondidas.valor !== null
          ? textoDeBase(m.encuestas.respondidas, { uno: 'realizada', varios: 'realizadas' })
          // "Sin datos" también sale cuando SÍ hubo realizadas pero ninguna tiene encuesta (de
          // antes de la Entrega 3): distinto mensaje de "todavía no hay nada que mostrar".
          : m.conteos.realizadas > 0 ? 'ninguna tiene encuesta en el período' : 'ninguna visita realizada todavía'}
      />
      <StatTile
        label="De la consulta a la visita"
        value={textoDeTiempo(m.tiempos.consultaAVisita)}
        context={m.tiempos.consultaAVisita.valor === null
          ? 'sin consultas previas vinculadas'
          : `mediana ${textoDeBase(m.tiempos.consultaAVisita, VISITAS)}`}
      />
    </div>
  )
}

'use client'

/**
 * Sección 5 del Tablero: llamadas a las solicitudes de tasación (crm-estadisticas-llamadas, D3).
 * Números y tablas, sin gráficos. Cada número con su base; con menos de 20 casos, "Pocos casos".
 */

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { POCOS_CASOS, type MetricasLlamadas, type Reparto, type ResultadoLlamada, type Tiempo } from '@/lib/crm/metricas-llamadas'
import type { SeccionLlamadas as DatosSeccion } from '@/lib/metrics/tablero/llamadas'
import { duracion } from '@/lib/crm/formato-fecha'
import { num, pct } from '@/components/metrics/panel/formato'
import { Caja, Cuadro, Seccion, Subtitulo, tabla, td, tdR, th } from './ui'

const FUENTE =
  'Las solicitudes de tasación que cuenta el Tablero (una por persona, sin pruebas, colegas ni pedidos repetidos), creadas desde el 26/11/2026 a las 21:04. ' +
  'Llamadas y WhatsApp marcados en la ficha, sin anulados; los mensajes del Inbox, las plantillas y el agente de IA no entran. ' +
  'Horas hábiles: lunes a viernes de 10 a 14, el horario de la coordinación. Las solicitudes del período en curso todavía pueden avanzar.'

const RESULTADO: Record<ResultadoLlamada, string> = {
  no_atendio: 'No atendió',
  agendo: 'Atendió y agendó',
  volver_a_llamar: 'Atendió · volver a llamar',
  no_interesa: 'Atendió · no le interesa',
  numero_equivocado: 'Número equivocado',
}

const min = (m: number | null) => (m == null ? '—' : duracion(m))
/**
 * Horas hábiles, sin pasar a días: un día hábil tiene 4 h (de 10 a 14), no 24, y "1 día 21 h" de una semana
 * hábil entera mentiría (revisión de código 1).
 */
export function horasHabiles(m: number | null): string {
  if (m == null) return '—'
  const t = Math.max(0, Math.floor(m))
  if (t < 60) return `${t} min`
  const h = Math.floor(t / 60), r = t % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
const pocos = (n: number) => (n > 0 && n < POCOS_CASOS ? ' · Pocos casos' : '')
const casos = (n: number, palabra = 'solicitud') => `${num(n)} ${n === 1 ? palabra : palabra === 'solicitud' ? 'solicitudes' : palabra + 's'}`

export function SeccionLlamadas({ s, onReintentar }: { s: DatosSeccion; onReintentar: () => void }) {
  return (
    <Seccion n={5} titulo="Llamadas a las solicitudes" fuente={FUENTE}>
      <Cuerpo s={s} onReintentar={onReintentar} />
    </Seccion>
  )
}

function Cuerpo({ s, onReintentar }: { s: DatosSeccion; onReintentar: () => void }) {
  if (!s.ok) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-rose-700 dark:text-rose-300">
        No se pudo cargar
        <Button size="sm" variant="outline" onClick={onReintentar}><RefreshCw className="h-4 w-4 mr-1" />Reintentar</Button>
      </div>
    )
  }
  if (s.antesDeLaMedicion) {
    return <p className="text-sm text-muted-foreground">La medición de llamadas empieza el 26/11/2026 a las 21:04: este período es anterior.</p>
  }
  const m = s.datos
  const aviso = (
    <p className="text-xs text-muted-foreground">
      Sin comparar.{s.medicionRecortada && ' La medición empieza el 26/11/2026 a las 21:04: las solicitudes anteriores no cuentan.'}
    </p>
  )
  if (m.solicitudes === 0) {
    return <>{aviso}<p className="text-sm text-muted-foreground">No hay solicitudes de tasación en este período.</p></>
  }
  if (m.llamadas === 0) {
    return (
      <>
        {aviso}
        <p className="text-sm">{casos(m.solicitudes)} · todavía no hay llamadas registradas</p>
        <p className="text-sm text-muted-foreground tabular-n">Sin llamada ni WhatsApp registrado: {num(m.sinIntento)}</p>
      </>
    )
  }
  return (
    <>
      {aviso}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cuadro
          titulo="Primera llamada (mediana hábil)"
          valor={horasHabiles(m.primeraLlamada.medianaHabiles)}
          sub={`Promedio ${horasHabiles(m.primeraLlamada.promedioHabiles)} hábiles · reloj: mediana ${min(m.primeraLlamada.medianaReloj)}, promedio ${min(m.primeraLlamada.promedioReloj)}`}
          antes={`Sobre ${casos(m.primeraLlamada.n)}${pocos(m.primeraLlamada.n)}${m.primeraLlamada.sinCaso ? ` · ${num(m.primeraLlamada.sinCaso)} todavía sin llamar no ${m.primeraLlamada.sinCaso === 1 ? 'entra' : 'entran'} en la cuenta` : ''}`}
        />
        <Proporcion titulo="Atendieron una llamada" x={m.contactados} />
        <Proporcion titulo="Agendaron en una llamada" x={m.agendados} nota="No es lo mismo que «Agendadas» del embudo, que cuenta cualquier vía." />
        <Cuadro titulo="Sin llamada ni WhatsApp registrado" valor={num(m.sinIntento)} sub={`de ${casos(m.solicitudes)}${pocos(m.solicitudes)}`} />
      </div>

      <Subtitulo>De la primera a la segunda llamada</Subtitulo>
      <Segunda t={m.primeraASegunda} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        <TablaReparto titulo="En qué llamada atendieron" r={m.intentosHastaAtender} vacio="Nadie atendió todavía" />
        <TablaReparto titulo="En qué llamada agendaron" r={m.agendoEnLlamada} vacio="Nadie agendó en una llamada todavía" />
        <Resultados m={m} />
      </div>
    </>
  )
}

function Proporcion({ titulo, x, nota }: { titulo: string; x: { n: number; de: number }; nota?: string }) {
  return <Cuadro titulo={titulo} valor={pct(x.de ? x.n / x.de : null, 0)} sub={`${num(x.n)} de ${casos(x.de)}${pocos(x.de)}`} antes={nota} />
}

function Segunda({ t }: { t: Tiempo }) {
  if (t.n === 0) return <p className="text-sm text-muted-foreground">Todavía sin casos</p>
  return (
    <p className="text-sm tabular-n">
      Hábiles: mediana <strong>{horasHabiles(t.medianaHabiles)}</strong>, promedio {horasHabiles(t.promedioHabiles)} · reloj: mediana {min(t.medianaReloj)}, promedio {min(t.promedioReloj)}
      <span className="text-muted-foreground"> · sobre {casos(t.n)}{pocos(t.n)}</span>
    </p>
  )
}

function TablaReparto({ titulo, r, vacio }: { titulo: string; r: Reparto; vacio: string }) {
  return (
    <Caja>
      <table className={tabla}>
        <thead><tr className="border-b">
          <th className={`${th} text-left`}>{titulo}</th><th className={`${th} text-right`}>Solicitudes</th><th className={`${th} text-right`}>%</th>
        </tr></thead>
        <tbody>
          {r.n === 0
            ? <tr><td className={`${td} text-muted-foreground`} colSpan={3}>{vacio}</td></tr>
            : r.reparto.map((f) => (
              <tr key={f.intento} className="border-b last:border-0">
                <td className={td}>{f.intento === '4 o más' ? 'Llamada 4 o más' : `Llamada ${f.intento}`}</td>
                <td className={tdR}>{num(f.n)}</td>
                <td className={tdR}>{pct(f.n / r.n, 0)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {r.n > 0 && (
        <p className="px-2 pb-2 text-xs text-muted-foreground tabular-n">
          Promedio: llamada {num(r.promedio, 1)} · sobre {casos(r.n)}{pocos(r.n)}
        </p>
      )}
    </Caja>
  )
}

function Resultados({ m }: { m: MetricasLlamadas }) {
  return (
    <Caja>
      <table className={tabla}>
        <thead><tr className="border-b">
          <th className={`${th} text-left`}>Resultado</th><th className={`${th} text-right`}>Llamadas</th><th className={`${th} text-right`}>%</th>
        </tr></thead>
        <tbody>
          {m.resultados.map((r) => (
            <tr key={r.resultado} className="border-b last:border-0">
              <td className={td}>{RESULTADO[r.resultado]}</td>
              <td className={tdR}>{num(r.n)}</td>
              <td className={tdR}>{pct(r.n / m.llamadas, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2 pb-2 text-xs text-muted-foreground tabular-n">Sobre {casos(m.llamadas, 'llamada')}{pocos(m.llamadas)}</p>
    </Caja>
  )
}

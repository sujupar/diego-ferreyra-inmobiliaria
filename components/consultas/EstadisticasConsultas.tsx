'use client'

/**
 * Pestaña Estadísticas (spec Entrega 2 §3.3). Recibe las cifras ya calculadas
 * (lib/consultas/estadisticas.ts, con los datos que ya están en la pantalla):
 * acá solo se muestran.
 *
 * Toda cifra con su base: sin base dice "Sin datos" (nunca 0) y con base chica
 * dice "orientativo". En el celular todo va en tarjetas apiladas: nada de
 * tablas anchas con scroll de costado.
 */
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Cifra } from '@/lib/visitas/metricas'
import type { EstadisticasConsultas, FilaGrupo, FilaPropiedad } from '@/lib/consultas/estadisticas'
import { SIN_PROPIEDAD } from '@/lib/consultas/bandeja'
import { cn } from '@/lib/utils'

function textoCifra(c: Cifra, sufijo = ''): string {
  if (c.valor === null) return 'Sin datos'
  return `${c.valor.toLocaleString('es-AR')}${sufijo}`
}

function Orientativo({ c }: { c: Cifra }) {
  if (!c.orientativo || c.valor === null) return null
  return <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground" title={`Base chica: ${c.base}`}>orientativo</span>
}

function Tarjeta({ titulo, c, sufijo, ayuda }: { titulo: string; c: Cifra; sufijo?: string; ayuda?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-3">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <span className={cn('text-2xl font-semibold', c.valor === null && 'text-base text-muted-foreground')}>
        {textoCifra(c, sufijo)}<Orientativo c={c} />
      </span>
      {ayuda && <span className="text-xs text-muted-foreground">{ayuda}</span>}
    </div>
  )
}

function Grupo({ titulo, filas, onTocar, extra }: {
  titulo: string
  filas: Array<FilaGrupo | FilaPropiedad>
  onTocar?: (f: FilaGrupo) => void
  extra?: (f: FilaGrupo | FilaPropiedad) => ReactNode
}) {
  if (filas.length === 0) return null
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filas.map((f) => {
          const contenido = (
            <>
              <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                {f.clave === SIN_PROPIEDAD.valor && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
                <span className="truncate">{f.etiqueta}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {f.consultas === 1 ? '1 consulta' : `${f.consultas} consultas`} · {textoCifra(f.porcentaje, ' %')} del total
              </span>
              <span className="text-sm">
                {f.visitas === 1 ? '1 visita' : `${f.visitas} visitas`} · conversión {textoCifra(f.conversion, ' %')}<Orientativo c={f.conversion} />
              </span>
              {extra?.(f)}
            </>
          )
          return (
            <li key={f.clave}>
              {onTocar ? (
                <button type="button" onClick={() => onTocar(f)}
                  className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border bg-card p-3 text-left hover:bg-secondary">
                  {contenido}
                </button>
              ) : (
                <div className="flex flex-col gap-0.5 rounded-xl border bg-card p-3">{contenido}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function EstadisticasConsultas({ e, etiquetaPeriodo, onPropiedad, onSinPropiedad }: {
  e: EstadisticasConsultas
  etiquetaPeriodo: string
  /** Tocar una propiedad: la Bandeja filtrada por ella. */
  onPropiedad: (propiedadId: string) => void
  /** Tocar "Sin propiedad identificada": la hoja para conectar avisos (o el filtro, si no puede conectar). */
  onSinPropiedad: () => void
}) {
  const t = e.tarjetas
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Resumen" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Tarjeta titulo={`Consultas · ${etiquetaPeriodo}`} c={t.consultas} />
        <Tarjeta titulo="Por día" c={t.porDia} ayuda="promedio" />
        <Tarjeta titulo="Personas distintas" c={t.personas} />
        <Tarjeta titulo="Con propiedad identificada" c={t.conPropiedad} sufijo=" %" />
        <Tarjeta titulo="Visitas agendadas" c={t.visitas} />
        <Tarjeta titulo="Consulta → visita" c={t.conversion} sufijo=" %" ayuda="personas con visita / con WhatsApp" />
      </section>

      <section aria-label="De la consulta a la visita" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">De la consulta a la visita</h2>
        <ol className="flex flex-col gap-2">
          {e.recorrido.map((p) => {
            const ancho = e.recorrido[0].cantidad > 0 ? Math.max(2, Math.round((p.cantidad / e.recorrido[0].cantidad) * 100)) : 0
            return (
              <li key={p.clave} className="flex flex-col gap-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span className={cn(p.masAngosto && 'font-semibold')}>{p.etiqueta}</span>
                  <span>
                    <strong>{p.cantidad}</strong>
                    {p.delAnterior !== null && <span className="text-muted-foreground"> · {Math.round(p.delAnterior * 100)} % del paso anterior</span>}
                  </span>
                </span>
                <span className="h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className={cn('block h-full rounded-full', p.masAngosto ? 'bg-amber-500' : 'bg-brand/60')} style={{ width: `${ancho}%` }} />
                </span>
                {p.masAngosto && <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Acá se pierde más gente</span>}
              </li>
            )
          })}
        </ol>
      </section>

      <Grupo titulo="Por portal" filas={e.porPortal} />
      <Grupo
        titulo="Por propiedad"
        filas={e.porPropiedad}
        onTocar={(f) => (f.clave === SIN_PROPIEDAD.valor ? onSinPropiedad() : onPropiedad(f.clave))}
        extra={(f) => ('portales' in f && f.portales.length > 0
          ? <span className="text-xs text-muted-foreground">{f.portales.map((p) => `${p.etiqueta} ${p.n}`).join(' · ')}</span>
          : null)}
      />
      <Grupo titulo="Por mes" filas={e.porMes} />
      <Grupo titulo="Por canal" filas={e.porCanal} />
      {e.porAsesor && <Grupo titulo="Por asesor" filas={e.porAsesor} />}
    </div>
  )
}

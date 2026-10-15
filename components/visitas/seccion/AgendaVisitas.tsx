import Link from 'next/link'
import { FilaVisita } from './FilaVisita'
import type { DiaDeAgenda } from '@/lib/visitas/resumen'

/** Agenda Hoy / Mañana / próximos días (spec §3.4), con todos los estados. */
export function AgendaVisitas({ agenda, mostrarAsesor, hrefTodas }: { agenda: DiaDeAgenda[]; mostrarAsesor: boolean; hrefTodas: string }) {
  const nadaMasAdelante = agenda.length === 1
  return (
    <section aria-labelledby="agenda-titulo" className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="agenda-titulo" className="text-lg font-semibold">Agenda</h2>
        <Link href={hrefTodas} className="inline-flex min-h-11 items-center text-sm text-primary underline">Ver todas</Link>
      </div>
      {agenda.map(dia => (
        <div key={dia.fecha} className="space-y-2">
          <h3 className="eyebrow">{dia.etiqueta}</h3>
          {dia.visitas.length === 0
            ? <p className="text-sm text-muted-foreground">No hay visitas hoy.</p>
            : (
              <ul className="space-y-2">
                {dia.visitas.map(v => <FilaVisita key={v.id} visita={v} cuando="hora" mostrarAsesor={mostrarAsesor} />)}
              </ul>
            )}
        </div>
      ))}
      {nadaMasAdelante && <p className="text-sm text-muted-foreground">Tampoco hay visitas en los próximos 7 días.</p>}
    </section>
  )
}

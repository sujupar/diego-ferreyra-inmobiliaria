import type { FilaComun } from '@/lib/crm/cartera'
import { miles } from '@/lib/crm/cartera-pantalla'
import { cn } from '@/lib/utils'
import { CabeceraFilas, FilaProceso, type ModoFila } from './FilaProceso'
import { CargarMas } from './PieCartera'
import type { MetaGrupo } from './textos'

// Un grupo de la lista (maqueta `tarjetaLista()`): cabecera con su número (burbuja de
// alerta o neutra; la lista larga, ninguno), el texto que dice por qué está ahí, las filas
// y su propio "Cargar 25 más". La lista lleva `@container/lista`: el ancho de ESTE bloque
// decide si las filas son tabla o tarjeta (D10).

export function GrupoCartera({
  clave,
  meta,
  filas,
  visibles,
  alCargarMas,
  modo,
  conAsesor,
  cerrados,
  volver,
  ahora,
  extra,
  seleccion,
  sinProcesoTexto,
}: {
  clave: string
  meta: MetaGrupo
  filas: FilaComun[]
  visibles: number
  alCargarMas: () => void
  modo: ModoFila
  conAsesor: boolean
  cerrados: boolean
  volver: string
  ahora: Date
  /** "Seleccionar" y "Ordenar por", en la cabecera de la lista del dueño y de Contactos. */
  extra?: React.ReactNode
  seleccion?: { marcadas: ReadonlySet<string>; alAlternar: (id: string) => void }
  sinProcesoTexto?: string
}) {
  const aLaVista = filas.slice(0, visibles)
  return (
    <section aria-label={meta.titulo} className="overflow-hidden rounded-xl border border-border bg-card" data-grupo={clave}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-1 pt-3">
        <h2 className="flex min-w-0 flex-1 basis-48 items-center gap-2 text-sm font-semibold">
          {meta.titulo}
          {meta.numero && (
            <span
              data-burbuja={meta.numero === 'alerta' ? 'alerta' : 'neutra'}
              className={cn(
                'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                meta.numero === 'alerta' ? 'bg-destructive-suave text-destructive-texto' : 'bg-secondary text-foreground',
              )}
            >
              {miles(filas.length)}
            </span>
          )}
        </h2>
        {extra}
      </div>
      {meta.texto && <p className="px-4 pb-2 text-xs text-texto-suave">{meta.texto}</p>}
      <div className="@container/lista">
        <CabeceraFilas modo={modo} conAsesor={conAsesor} cerrados={cerrados} />
        <ul className="m-0 list-none divide-y divide-border p-0">
          {aLaVista.map((f) => (
            <li key={f.id}>
              <FilaProceso
                fila={f}
                modo={modo}
                conAsesor={conAsesor}
                conTasacion={meta.conTasacion}
                volver={volver}
                ahora={ahora}
                sinProcesoTexto={sinProcesoTexto}
                seleccion={seleccion ? { marcada: seleccion.marcadas.has(f.id), alAlternar: () => seleccion.alAlternar(f.id) } : undefined}
              />
            </li>
          ))}
        </ul>
      </div>
      {filas.length > visibles && <CargarMas alCargar={alCargarMas} />}
    </section>
  )
}

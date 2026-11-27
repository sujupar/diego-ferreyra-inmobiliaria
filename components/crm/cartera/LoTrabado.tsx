import Link from 'next/link'
import { ArrowRight, Clock, X } from 'lucide-react'
import type { FilaCartera, FiltrosCartera } from '@/lib/crm/cartera'
import { diasSinMovimiento, textoEspera, type Trabado } from '@/lib/crm/cartera-trabado'
import { detalleSinAsesor, hrefDeFila, miles, momentoDelCalculo, textoBotonTrabado } from '@/lib/crm/cartera-pantalla'
import { SIN_MOVIMIENTO_DIAS } from '@/lib/crm/cartera'
import { cn } from '@/lib/utils'
import { EstadoError } from '../ui/EstadoBloque'

// "Lo que está trabado" (maqueta `trabadoHtml()`, `.tr`; spec "Lo que está trabado"). Solo
// en la vista propia del dueño y en los abiertos: eso lo decide quien lo dibuja. Cuenta con
// `calcularTrabado`, sobre TODOS los abiertos sin colegas y sin los filtros de la lista, con
// las MISMAS reglas que marcan las filas. Si el último contacto no se pudo leer, no muestra
// ningún número: contar lo que no se sabe daría números falsos.

type ClaveTrabado = Exclude<FiltrosCartera['trabado'], ''>
const NOMBRES_VISIBLES = 5

interface Columna {
  clave: ClaveTrabado
  titulo: string
  base: string
  nota: string | null
  filas: FilaCartera[]
  detalle: (f: FilaCartera) => { texto: string; alerta: boolean; reloj: boolean }
}

export function LoTrabado({
  trabado,
  ahora,
  activo,
  volver,
  alFiltrar,
  alReintentar,
}: {
  trabado: Trabado | 'error'
  ahora: Date
  activo: FiltrosCartera['trabado']
  volver: string
  alFiltrar: (k: ClaveTrabado) => void
  alReintentar: () => void
}) {
  if (trabado === 'error') {
    return (
      <section aria-label="Lo que está trabado" className="rounded-xl border border-border bg-card" data-trabado="error">
        <EstadoError titulo="No se pudo cargar lo trabado" texto="No mostramos ningún número hasta poder contarlo." onReintentar={alReintentar} />
      </section>
    )
  }

  const columnas: Columna[] = [
    {
      clave: 'sin-contacto',
      titulo: 'Solicitudes sin primer contacto',
      base: `De ${miles(trabado.sinContacto.base)} solicitudes abiertas. Llama la coordinación.`,
      nota:
        trabado.sinContacto.anterioresAlRegistro > 0
          ? `Además, ${miles(trabado.sinContacto.anterioresAlRegistro)} anteriores al registro de llamadas, sin dato.`
          : null,
      filas: trabado.sinContacto.filas,
      detalle: (f) => ({ texto: textoEspera(f.creadoEn, ahora), alerta: true, reloj: true }),
    },
    {
      clave: 'sin-asesor',
      titulo: 'Procesos sin asesor',
      base: `Ya pasaron la solicitud y nadie los tiene. De ${miles(trabado.sinAsesor.base)} procesos.`,
      nota: null,
      filas: trabado.sinAsesor.filas,
      detalle: (f) => ({ texto: detalleSinAsesor(f), alerta: false, reloj: false }),
    },
    {
      clave: 'sin-movimiento',
      titulo: 'Seguimientos sin movimiento',
      base: `Sin contacto hace ${SIN_MOVIMIENTO_DIAS} días o más. De ${miles(trabado.sinMovimiento.base)} seguimientos.`,
      nota: null,
      filas: trabado.sinMovimiento.filas,
      detalle: (f) => ({
        texto: `${diasSinMovimiento(f, ahora) ?? 0} días · ${f.asesor ? f.asesor.nombre : 'sin asesor'}`,
        alerta: false,
        reloj: false,
      }),
    },
  ]

  return (
    <section aria-label="Lo que está trabado" className="overflow-hidden rounded-xl border border-border bg-card" data-trabado="ok">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold">Lo que está trabado</h2>
        <span className="text-xs text-texto-suave">{momentoDelCalculo(ahora)}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3">
        {columnas.map((c) => {
          const n = c.filas.length
          const puesto = activo === c.clave
          return (
            <div
              key={c.clave}
              data-columna={c.clave}
              className="flex min-w-0 flex-col gap-2 border-t border-border px-4 pb-4 pt-3 lg:[&+&]:border-l"
            >
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 flex-1 text-sm font-semibold">{c.titulo}</h3>
                <span
                  data-burbuja={n > 0 ? 'alerta' : 'neutra'}
                  className={cn(
                    'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                    n > 0 ? 'bg-destructive-suave text-destructive-texto' : 'bg-secondary text-foreground',
                  )}
                >
                  {miles(n)}
                </span>
              </div>
              <p className="text-xs text-texto-suave">{c.base}</p>
              {c.nota && <p className="text-xs text-texto-suave">{c.nota}</p>}
              {/* En el celular, solo el resumen: los nombres están en la lista de abajo. */}
              {n > 0 && (
                <ul className="m-0 hidden list-none flex-col p-0 md:flex" data-nombres>
                  {c.filas.slice(0, NOMBRES_VISIBLES).map((f) => {
                    const d = c.detalle(f)
                    return (
                      <li key={f.id}>
                        <Link
                          href={hrefDeFila(f, volver)}
                          className="-mx-2 flex min-h-11 flex-col justify-center gap-px rounded-sm px-2 py-1.5 hover:bg-accent"
                        >
                          <span className="text-sm font-medium">{f.nombre}</span>
                          <span className={cn('flex items-start gap-1 text-xs text-texto-suave', d.alerta && 'text-destructive-texto')}>
                            {d.reloj && <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
                            <span>{d.texto}</span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
              {n > 0 && (
                <button
                  type="button"
                  aria-pressed={puesto}
                  onClick={() => alFiltrar(c.clave)}
                  className="mt-auto inline-flex min-h-11 items-center justify-center gap-1.5 self-stretch rounded-md border border-border bg-card px-3 text-[13px] font-medium shadow-xs hover:bg-accent md:self-start md:raton:min-h-9"
                >
                  {puesto && <X aria-hidden className="size-4" />}
                  {textoBotonTrabado(n, puesto)}
                  {!puesto && <ArrowRight aria-hidden className="size-4" />}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

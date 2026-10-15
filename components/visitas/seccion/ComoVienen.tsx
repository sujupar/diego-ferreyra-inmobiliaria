import type { Metricas, FilaGrupo, Cifra } from '@/lib/visitas/metricas'
import { textoPorcentaje, textoDeTiempo, textoDeBase, TEXTO_LLEGA_CON_LA_ENCUESTA, TEXTO_SIN_DATOS } from '@/lib/visitas/presentacion'

const VISITAS = { uno: 'visita', varios: 'visitas' }

function textoRealizado(c: Cifra): string {
  const p = textoPorcentaje(c)
  return p ? `${p} se realizó (de ${c.base}${c.orientativo ? ' · orientativo' : ''})` : 'sin resultados todavía'
}

function Grupo({ titulo, filas }: { titulo: string; filas: FilaGrupo[] }) {
  // Un id con espacios rompe aria-labelledby (el espacio separa referencias).
  const id = `grupo-${titulo.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-2">
      <h3 id={id} className="text-sm font-semibold">{titulo}</h3>
      {filas.length === 0
        ? <p className="text-sm text-muted-foreground">{TEXTO_SIN_DATOS}</p>
        : (
          <ul className="divide-y rounded-lg border">
            {filas.map(f => (
              <li key={f.clave} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-3 text-sm">
                <span className="min-w-0 break-words font-medium">{f.etiqueta}</span>
                <span className="tabular-nums text-muted-foreground">
                  {`${f.cantidad} visita${f.cantidad === 1 ? '' : 's'} · ${textoRealizado(f.realizado)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

const TIEMPOS: ReadonlyArray<{ clave: keyof Metricas['tiempos']; etiqueta: string }> = [
  { clave: 'consultaAVisita', etiqueta: 'De la consulta a la visita' },
  { clave: 'anticipacion', etiqueta: 'Anticipación (de agendar a la visita)' },
  { clave: 'confirmacion', etiqueta: 'Confirmación (de agendar a confirmada)' },
  { clave: 'marcarResultado', etiqueta: 'Marcar el resultado (después de la visita)' },
]

/** "Cómo vienen las visitas" + "Qué opinan los que visitaron" (spec §3.4). */
export function ComoVienen({ metricas: m, mostrarAsesor }: { metricas: Metricas; mostrarAsesor: boolean }) {
  const base = m.embudo[0]?.cantidad ?? 0
  return (
    <>
      <section aria-labelledby="como-vienen-titulo" className="space-y-5 rounded-xl border bg-card p-4">
        <h2 id="como-vienen-titulo" className="text-lg font-semibold">Cómo vienen las visitas</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Embudo</h3>
          {base === 0
            ? <p className="text-sm text-muted-foreground">Todavía no hay visitas en este período.</p>
            : (
              <ol className="space-y-3">
                {m.embudo.map(p => (
                  <li key={p.clave} data-salto={p.saltoMasGrande ? 'true' : undefined} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className={p.saltoMasGrande ? 'font-semibold' : ''}>{p.etiqueta}</span>
                      <span className="tabular-nums">{p.cantidad}</span>
                    </div>
                    <div className="h-3 rounded-full bg-muted" aria-hidden="true">
                      <div
                        className={`h-3 rounded-full ${p.saltoMasGrande ? 'bg-brand' : 'bg-muted-foreground/40'}`}
                        style={{ width: `${Math.max(2, Math.round((p.cantidad / base) * 100))}%` }}
                      />
                    </div>
                    {p.saltoMasGrande && <p className="text-xs font-medium text-brand">Acá se pierde la mayor parte</p>}
                  </li>
                ))}
                {['Respondieron la encuesta', 'Dijeron cuánto ofertarían'].map(paso => (
                  <li key={paso} className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                    <span>{paso}</span><span>{TEXTO_LLEGA_CON_LA_ENCUESTA}</span>
                  </li>
                ))}
              </ol>
            )}
        </div>

        <Grupo titulo="Por origen" filas={m.porOrigen} />

        <section aria-labelledby="tiempos-titulo" className="space-y-2">
          <h3 id="tiempos-titulo" className="text-sm font-semibold">Tiempos (medianas)</h3>
          <ul className="divide-y rounded-lg border">
            {TIEMPOS.map(t => {
              const c = m.tiempos[t.clave]
              return (
                <li key={t.clave} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-3 text-sm">
                  <span className="min-w-0 break-words">{t.etiqueta}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {textoDeTiempo(c) ? `${textoDeTiempo(c)} · ${textoDeBase(c, VISITAS)}` : TEXTO_SIN_DATOS}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="motivos-titulo" className="space-y-2">
          <h3 id="motivos-titulo" className="text-sm font-semibold">Por qué no se hicieron</h3>
          {m.noSeHicieron.porMotivo.length === 0
            ? <p className="text-sm text-muted-foreground">{TEXTO_SIN_DATOS}</p>
            : (
              <ul className="divide-y rounded-lg border">
                {m.noSeHicieron.porMotivo.map(x => (
                  <li key={x.clave} className="flex justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0 break-words">{x.etiqueta}</span><span className="tabular-nums">{x.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        {mostrarAsesor && <Grupo titulo="Por asesor" filas={m.porAsesor} />}
      </section>

      <section aria-labelledby="opinan-titulo" className="space-y-2 rounded-xl border bg-card p-4">
        <h2 id="opinan-titulo" className="text-lg font-semibold">Qué opinan los que visitaron</h2>
        <p className="text-sm text-muted-foreground">{TEXTO_LLEGA_CON_LA_ENCUESTA}</p>
      </section>
    </>
  )
}

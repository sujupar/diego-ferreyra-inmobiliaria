/**
 * "Qué opinan los que visitaron" (spec §3.4 y §3.5). En la sección: una fila por propiedad. En la
 * ficha de una propiedad: además lo que más y menos gustó y los comentarios escritos. Todo como
 * TEXTO (lo escribió un desconocido). Cada cifra con su base; sin respuestas, "Sin datos".
 */
import type { OpinionPropiedad } from '@/lib/visitas/opiniones'
import type { Cifra } from '@/lib/visitas/metricas'
import { textoMonto } from '@/lib/visitas/encuesta/oferta'
import { TEXTO_SIN_RESPUESTAS } from '@/lib/visitas/presentacion'

function base(c: Cifra): string {
  return `de ${c.base}${c.orientativo ? ' · orientativo' : ''}`
}

function textoOferta(o: OpinionPropiedad): string {
  if (o.ofertaMediana.valor === null || !o.moneda) return 'Oferta mediana: sin ofertas en la moneda publicada'
  const monto = textoMonto(o.ofertaMediana.valor, o.moneda)
  if (o.diferencia.valor === null) return `Oferta mediana: ${monto} (${base(o.ofertaMediana)})`
  const d = o.diferencia.valor
  const relacion = d === 0 ? 'igual al publicado' : d < 0 ? `${Math.abs(d)} % debajo del publicado` : `${d} % arriba del publicado`
  return `Oferta mediana: ${monto} (${relacion} · de ${o.ofertaMediana.base})`
}

function Detalle({ o, completo }: { o: OpinionPropiedad; completo: boolean }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">{`${o.respuestas} ${o.respuestas === 1 ? 'respuesta' : 'respuestas'}`}</p>
      <p>{o.leGusto.valor === null ? 'Les gustó: sin datos' : `Les gustó: ${o.leGusto.valor} % (${base(o.leGusto)})`}</p>
      <p>{`Precio: ${o.precio.correcto} correcto · ${o.precio.alto} alto · ${o.precio.bajo} bajo`}</p>
      <p>{textoOferta(o)}</p>
      {completo && (
        <>
          {[{ titulo: 'Lo que más gustó', lista: o.masGusto }, { titulo: 'Lo que menos gustó', lista: o.menosGusto }].map(g => (
            <div key={g.titulo} className="pt-2">
              <p className="font-medium">{g.titulo}</p>
              {g.lista.length === 0
                ? <p className="text-muted-foreground">—</p>
                : <ul className="flex flex-wrap gap-2 pt-1">{g.lista.map(e => <li key={e.clave} className="rounded-full border px-3 py-1">{`${e.etiqueta} (${e.cantidad})`}</li>)}</ul>}
            </div>
          ))}
          {o.comentarios.length > 0 && (
            <div className="pt-2">
              <p className="font-medium">Comentarios</p>
              <ul className="space-y-1 pt-1">{o.comentarios.map((c, i) => <li key={i} className="break-words text-muted-foreground">{c}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function QueOpinan({ opiniones, modo }: { opiniones: OpinionPropiedad[]; modo: 'seccion' | 'propiedad' }) {
  const Titulo = modo === 'seccion' ? 'h2' : 'h3'
  return (
    <section aria-labelledby={`opinan-${modo}`} className="space-y-3 rounded-xl border bg-card p-4">
      <Titulo id={`opinan-${modo}`} className={modo === 'seccion' ? 'text-lg font-semibold' : 'text-base font-semibold'}>Qué opinan los que visitaron</Titulo>
      {opiniones.length === 0
        ? <p className="text-sm text-muted-foreground">{TEXTO_SIN_RESPUESTAS}</p>
        : modo === 'propiedad'
          ? <Detalle o={opiniones[0]} completo />
          : (
            <ul className="divide-y rounded-lg border">
              {opiniones.map(o => (
                <li key={o.propertyId} className="space-y-1 p-3">
                  <p className="break-words font-medium">{o.direccion}</p>
                  <Detalle o={o} completo={false} />
                </li>
              ))}
            </ul>
          )}
    </section>
  )
}

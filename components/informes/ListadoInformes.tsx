'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { textoDelPeriodo } from '@/lib/informes/periodo'
import type { FilaListado } from '@/lib/informes/listado'

interface Respuesta { informes: FilaListado[]; periodos: string[] }
type Estado = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; datos: Respuesta }
type FiltroEstado = 'borrador' | 'listo' | ''

/**
 * `/informes`: todos los informes quincenales (la pantalla de Paula). El 1 y el 16 la plataforma arma los de la
 * quincena que cerró; acá se ven los que faltan completar primero. Quién ve qué lo decide la ruta.
 */
export function ListadoInformes() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('borrador')
  const [hasta, setHasta] = useState('')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    const q = new URLSearchParams()
    if (filtroEstado) q.set('estado', filtroEstado)
    if (hasta) q.set('hasta', hasta)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cada cambio de filtro vuelve a pedir: se muestra "cargando"
    setEstado({ tipo: 'cargando' })
    fetch(`/api/informes?${q.toString()}`)
      .then(r => leerRespuesta<Respuesta>(r))
      .then(r => { if (vigente) setEstado(r.ok ? { tipo: 'listo', datos: r.data } : { tipo: 'error', mensaje: r.error }) })
      .catch(() => { if (vigente) setEstado({ tipo: 'error', mensaje: 'No hay conexión. Probá de nuevo.' }) })
    return () => { vigente = false }
  }, [filtroEstado, hasta, intento])

  const periodos = estado.tipo === 'listo' ? estado.datos.periodos : []
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <p className="eyebrow">Para los propietarios</p>
        <h1 className="display mt-1 text-2xl">Informes quincenales</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El 1 y el 16 de cada mes la plataforma arma el informe de la quincena que cerró de cada propiedad captada y
          avisa por email. Falta cargar Zonaprop y Argenprop, revisar y marcarlo como listo.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Mostrar</span>
          <select className="h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 md:w-56" value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value as FiltroEstado)}>
            <option value="borrador">Para completar</option>
            <option value="listo">Listos</option>
            <option value="">Todos</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Período</span>
          <select className="h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 md:w-64" value={hasta} onChange={e => setHasta(e.target.value)}>
            <option value="">Todos los períodos</option>
            {periodos.map(p => <option key={p} value={p}>Cerró el {p.split('-').reverse().join('/')}</option>)}
          </select>
        </label>
      </div>

      {estado.tipo === 'cargando' && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" /></div>}
      {estado.tipo === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{estado.mensaje}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setIntento(n => n + 1)}>Reintentar</Button>
        </div>
      )}
      {estado.tipo === 'listo' && <Filas informes={estado.datos.informes} filtro={filtroEstado} />}
    </div>
  )
}

// Componente de MÓDULO: ver CLAUDE.md § "NUNCA declarar un componente dentro de otro".
function Filas({ informes, filtro }: { informes: FilaListado[]; filtro: FiltroEstado }) {
  if (!informes.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {filtro === 'borrador' ? 'No hay informes para completar. ' : 'No hay informes con ese filtro. '}
        Un informe a medida se arma desde la ficha de la propiedad, pestaña Informes.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {informes.map(i => (
        <li key={i.id}>
          <Link href={`/informes/${i.id}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 hover:bg-muted/50">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{i.direccion || 'Propiedad sin dirección'}</span>
              <span className="block text-xs text-muted-foreground">
                Período {textoDelPeriodo(i.desde, i.hasta)} · {i.origen === 'ciclo' ? 'Automático' : 'A medida'}
              </span>
            </span>
            {i.estado === 'listo' ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Listo</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {i.faltantes ? `Faltan ${i.faltantes} ${i.faltantes === 1 ? 'dato' : 'datos'}` : 'Para revisar y marcar listo'}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

'use client'

/**
 * "Ver todas" (spec §3.4): todas las visitas del alcance con filtros y paginación. El
 * servidor filtra, ordena (más reciente primero) y cuenta (GET /api/visits).
 */
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FilterBar } from '@/components/filters/FilterBar'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { VisitsTable } from '../_components/VisitsTable'
import { FILTROS_ORIGEN, ESTADOS_FILTRO } from '@/lib/visitas/filtros'
import { ORIGEN_INFO, esOrigenVisita } from '@/lib/visitas/origen'
import { ESTADO_ETIQUETA, esEstadoVisita } from '@/lib/visitas/transiciones'
import { esFechaValida } from '@/lib/visitas/periodo'
import { esRol, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { VisitaListado } from '@/lib/visitas/tipos'

export const POR_PAGINA_LISTA = 25
const FILTROS_DEFECTO = { from: '', to: '', asesor: '', propiedad: '', origen: '', estado: '', pagina: '' }
type Filtros = typeof FILTROS_DEFECTO
const PERMITIDOS = { origen: ['', ...FILTROS_ORIGEN], estado: ['', ...ESTADOS_FILTRO] }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizar(f: Filtros): Filtros {
  return {
    ...f,
    from: esFechaValida(f.from) ? f.from : '',
    to: esFechaValida(f.to) ? f.to : '',
    asesor: UUID_RE.test(f.asesor) ? f.asesor : '',
    propiedad: UUID_RE.test(f.propiedad) ? f.propiedad : '',
    pagina: /^[1-9]\d*$/.test(f.pagina) ? f.pagina : '',
  }
}

const ETIQUETA_ESTADO_FILTRO = (e: string): string =>
  e === 'activas' ? 'Activas' : e === 'sin_resultado' ? 'Pasaron sin resultado' : esEstadoVisita(e) ? ESTADO_ETIQUETA[e] : e
const OPCIONES_ESTADO = [{ value: '', label: 'Todos los estados' }, ...ESTADOS_FILTRO.map(e => ({ value: e, label: ETIQUETA_ESTADO_FILTRO(e) }))]
const OPCIONES_ORIGEN = [{ value: '', label: 'Todos los orígenes' },
  ...FILTROS_ORIGEN.map(o => ({ value: o, label: esOrigenVisita(o) ? ORIGEN_INFO[o].etiqueta : 'Sin origen' }))]

export default function TodasLasVisitasPage() {
  return <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}><Lista /></Suspense>
}

function Lista() {
  const { filtros: mostrado, aplicados: filtros, aplicar, limpiar } = useFiltrosUrl({ defectos: FILTROS_DEFECTO, permitidos: PERMITIDOS, normalizar })
  const [rol, setRol] = useState<string | null | 'cargando'>('cargando')
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  const [pagina, setPagina] = useState<{ filas: VisitaListado[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pedidos = usePedidosVersionados()

  useEffect(() => {
    fetch('/api/auth/me').then(r => (r.ok ? r.json() : null))
      .then((d: unknown) => setRol(d && typeof d === 'object' && 'role' in d && typeof d.role === 'string' ? d.role : null))
      .catch(() => setRol(null))
  }, [])
  const verTodo = rol !== 'cargando' && esRol(rol) && puedeVerTodasLasVisitas(rol)
  useEffect(() => {
    if (!verTodo) return
    fetch('/api/users/advisors').then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (r.ok) setAsesores(r.data ?? []) }).catch(() => {})
  }, [verTodo])

  const numeroDePagina = Number(filtros.pagina || '1')

  useEffect(() => {
    if (rol === 'cargando') return
    const { gen, signal } = pedidos.abrir()
    const qs = new URLSearchParams({ pagina: String(numeroDePagina), porPagina: String(POR_PAGINA_LISTA) })
    if (filtros.from) qs.set('desde', filtros.from)
    if (filtros.to) qs.set('hasta', filtros.to)
    if (verTodo && filtros.asesor) qs.set('asesor', filtros.asesor)
    if (filtros.propiedad) qs.set('propiedad', filtros.propiedad)
    if (filtros.origen) qs.set('origen', filtros.origen)
    if (filtros.estado) qs.set('estado', filtros.estado)
    setError(null)
    fetch(`/api/visits?${qs}`, { signal })
      .then(async r => {
        const lectura = await leerRespuesta<VisitaListado[]>(r.clone())
        const cuerpo: unknown = await r.json().catch(() => null)
        const total = cuerpo && typeof cuerpo === 'object' && 'total' in cuerpo && typeof cuerpo.total === 'number' ? cuerpo.total : null
        if (!pedidos.vigente(gen)) return
        if (!lectura.ok) { setError(lectura.error); setPagina(null); return }
        setPagina({ filas: lectura.data ?? [], total: total ?? (lectura.data ?? []).length })
      })
      .catch(() => { if (pedidos.vigente(gen)) setError('No hay conexión. Probá de nuevo.') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, rol])

  const paginas = pagina ? Math.max(1, Math.ceil(pagina.total / POR_PAGINA_LISTA)) : 1
  const opcionesPropiedad = [{ value: '', label: 'Todas las propiedades' },
    ...[...new Map((pagina?.filas ?? []).map(v => [v.property_id, v.direccion ?? 'Propiedad sin dirección'])).entries()]
      .map(([value, label]) => ({ value, label }))]

  return (
    <div className="space-y-4">
      <div>
        <Link href="/visits" className="inline-flex min-h-11 items-center text-sm text-primary underline">← Visitas</Link>
        <h1 className="text-2xl font-semibold">Todas las visitas</h1>
      </div>
      <FilterBar
        selects={[
          { key: 'estado', label: 'Estado', options: OPCIONES_ESTADO },
          { key: 'origen', label: 'Origen', options: OPCIONES_ORIGEN },
          { key: 'propiedad', label: 'Propiedad', options: opcionesPropiedad },
          ...(verTodo ? [{ key: 'asesor', label: 'Asesor', options: [{ value: '', label: 'Todos los asesores' }, ...asesores.map(a => ({ value: a.id, label: a.full_name }))] }] : []),
        ]}
        values={mostrado}
        onChange={(k, valor) => aplicar({ [k]: valor, pagina: '' })}
        onClear={() => limpiar()}
        extraActivo={!!mostrado.from || !!mostrado.to}
      >
        <DateRangeFilter value={{ from: mostrado.from, to: mostrado.to }} onChange={r => aplicar({ from: r.from, to: r.to, pagina: '' })} />
      </FilterBar>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!pagina && !error && <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
      {pagina && (
        <>
          <VisitsTable visits={pagina.filas} mostrarAsesor={verTodo} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Página {numeroDePagina} de {paginas} · {pagina.total} visita{pagina.total === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={numeroDePagina <= 1}
                onClick={() => aplicar({ pagina: numeroDePagina - 1 <= 1 ? '' : String(numeroDePagina - 1) })}>Anterior</Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={numeroDePagina >= paginas}
                onClick={() => aplicar({ pagina: String(numeroDePagina + 1) })}>Siguiente</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

'use client'

/**
 * Sección Visitas (spec §3.4, diseño A — Claridad): resumen del día, período y filtros,
 * tarjetas, agenda, "requieren tu acción" y "cómo vienen las visitas". Las cuentas las
 * hace el servidor (GET /api/visits/resumen → lib/visitas/resumen.ts); esta pantalla
 * solo pide y compone.
 *
 * Filtros en la URL (lib/filters/use-filtros-url). Compatibilidad: el link de /inicio
 * llega como `?from=<hoy>&to=<hoy>[&onlyMine=true]` y abre el período "Hoy".
 */
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { EncabezadoVisitas } from '@/components/visitas/seccion/EncabezadoVisitas'
import { TarjetasVisitas } from '@/components/visitas/seccion/TarjetasVisitas'
import { AgendaVisitas } from '@/components/visitas/seccion/AgendaVisitas'
import { RequierenAccion } from '@/components/visitas/seccion/RequierenAccion'
import { ComoVienen } from '@/components/visitas/seccion/ComoVienen'
import { PERIODOS, resolverPeriodo, esFechaValida } from '@/lib/visitas/periodo'
import { FILTROS_ORIGEN } from '@/lib/visitas/filtros'
import { ORIGEN_INFO, esOrigenVisita } from '@/lib/visitas/origen'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import { resumenDelDia } from '@/lib/visitas/presentacion'
import { esRol, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { ResumenVisitas } from '@/lib/visitas/resumen'

// Constantes de MÓDULO: dentro del componente cambiarían de identidad en cada render y
// el hook de filtros re-pediría sin parar.
const FILTROS_DEFECTO = { periodo: '30d', from: '', to: '', asesor: '', propiedad: '', origen: '', onlyMine: '' }
type Filtros = typeof FILTROS_DEFECTO
const PERMITIDOS = { periodo: [...PERIODOS], origen: ['', ...FILTROS_ORIGEN], onlyMine: ['', 'true'] }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizar(f: Filtros): Filtros {
  return {
    ...f,
    from: esFechaValida(f.from) ? f.from : '',
    to: esFechaValida(f.to) ? f.to : '',
    // "A mi nombre" (onlyMine) y un asesor elegido son excluyentes: gana onlyMine.
    asesor: f.onlyMine === 'true' || !UUID_RE.test(f.asesor) ? '' : f.asesor,
    propiedad: UUID_RE.test(f.propiedad) ? f.propiedad : '',
  }
}

const OPCIONES_ORIGEN = [
  { value: '', label: 'Todos los orígenes' },
  ...FILTROS_ORIGEN.map(o => ({ value: o, label: esOrigenVisita(o) ? ORIGEN_INFO[o].etiqueta : 'Sin origen' })),
]

type Identidad = { id: string; rol: string } | null

function leerIdentidad(d: unknown): Identidad {
  if (!d || typeof d !== 'object') return null
  const id = 'id' in d && typeof d.id === 'string' ? d.id : null
  const rol = 'role' in d && typeof d.role === 'string' ? d.role : null
  return id && rol ? { id, rol } : null
}

export default function VisitsPage() {
  return (
    <Suspense fallback={<Esqueleto />}>
      <VisitasClient />
    </Suspense>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Visitas</h1>
        <p className="text-muted-foreground">Cargando…</p>
      </div>
      <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </div>
  )
}

function VisitasClient() {
  const { filtros: mostrado, aplicados: filtros, aplicar, limpiar } = useFiltrosUrl({
    defectos: FILTROS_DEFECTO, permitidos: PERMITIDOS, normalizar,
  })
  const [identidad, setIdentidad] = useState<Identidad | 'cargando'>('cargando')
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  const [datos, setDatos] = useState<{ clave: string; resumen: ResumenVisitas } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recarga, setRecarga] = useState(0)
  const pedidos = usePedidosVersionados()
  const hoy = useMemo(() => fechaEnArgentina(new Date()), [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then((d: unknown) => setIdentidad(leerIdentidad(d)))
      .catch(() => setIdentidad(null))
  }, [])

  const yo = identidad === 'cargando' ? null : identidad
  const verTodo = !!yo && esRol(yo.rol) && puedeVerTodasLasVisitas(yo.rol)

  useEffect(() => {
    if (!verTodo) return
    fetch('/api/users/advisors')
      .then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (r.ok) setAsesores(r.data ?? []) })
      .catch(() => {})
  }, [verTodo])

  const periodo = resolverPeriodo(filtros, hoy)
  const asesorPedido = verTodo ? (filtros.onlyMine === 'true' && yo ? yo.id : filtros.asesor) : ''
  const clave = periodo.ok
    ? [periodo.periodo.desde, periodo.periodo.hasta, asesorPedido, filtros.propiedad, filtros.origen].join('|')
    : ''

  useEffect(() => {
    if (identidad === 'cargando' || !periodo.ok) return
    const { gen, signal } = pedidos.abrir()
    const qs = new URLSearchParams({ desde: periodo.periodo.desde, hasta: periodo.periodo.hasta })
    if (asesorPedido) qs.set('asesor', asesorPedido)
    if (filtros.propiedad) qs.set('propiedad', filtros.propiedad)
    if (filtros.origen) qs.set('origen', filtros.origen)
    setCargando(true)
    fetch(`/api/visits/resumen?${qs}`, { signal })
      .then(r => leerRespuesta<ResumenVisitas>(r))
      .then(r => {
        if (!pedidos.vigente(gen)) return
        if (r.ok) { setDatos({ clave, resumen: r.data }); setError(null) }
        else setError(r.error)
      })
      .catch(() => { if (pedidos.vigente(gen)) setError('No hay conexión. Probá de nuevo.') })
      .finally(() => pedidos.siVigente(gen, () => setCargando(false)))
    // `clave` resume período + filtros; `recarga` fuerza un pedido nuevo tras una acción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, identidad, recarga])

  const recargar = () => setRecarga(n => n + 1)
  // Regla del tablero: un resumen de OTRO período/filtro no se muestra como si fuera este.
  const resumen = datos && datos.clave === clave ? datos.resumen : null

  const hrefTodas = (() => {
    if (!periodo.ok) return '/visits/todas'
    const qs = new URLSearchParams({ from: periodo.periodo.desde, to: periodo.periodo.hasta })
    if (asesorPedido) qs.set('asesor', asesorPedido)
    if (filtros.propiedad) qs.set('propiedad', filtros.propiedad)
    if (filtros.origen) qs.set('origen', filtros.origen)
    return `/visits/todas?${qs}`
  })()

  const opcionesPropiedad = [
    { value: '', label: 'Todas las propiedades' },
    ...(resumen?.propiedades ?? []).map(p => ({ value: p.id, label: p.direccion })),
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Visitas</h1>
        <p className="text-muted-foreground">
          {resumen ? resumenDelDia(resumen.visitasHoy, resumen.requieren.total) : 'Cargando…'}
        </p>
      </div>

      <EncabezadoVisitas
        clave={periodo.ok ? periodo.periodo.clave : 'personalizado'}
        desde={periodo.ok ? periodo.periodo.desde : mostrado.from}
        hasta={periodo.ok ? periodo.periodo.hasta : mostrado.to}
        valores={{ asesor: mostrado.onlyMine === 'true' && yo ? yo.id : mostrado.asesor, propiedad: mostrado.propiedad, origen: mostrado.origen }}
        opcionesAsesor={verTodo ? [{ value: '', label: 'Todos los asesores' }, ...asesores.map(a => ({ value: a.id, label: a.full_name }))] : null}
        opcionesPropiedad={opcionesPropiedad}
        opcionesOrigen={OPCIONES_ORIGEN}
        onPeriodo={c => aplicar({ periodo: c, from: '', to: '' })}
        onRango={(desde, hasta) => aplicar({ periodo: 'personalizado', from: desde, to: hasta })}
        onFiltro={(k, valor) => aplicar(k === 'asesor' ? { asesor: valor, onlyMine: '' } : k === 'propiedad' ? { propiedad: valor } : { origen: valor })}
        onLimpiar={() => limpiar()}
        onAgendada={recargar}
      />

      {!periodo.ok && <p role="alert" className="text-sm text-destructive">{periodo.error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{cargando ? 'Actualizando las visitas' : ''}</p>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 p-4 text-sm">
          <span>{error}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={recargar}>Reintentar</Button>
        </div>
      )}

      {!resumen && !error && periodo.ok && (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {resumen && (
        <>
          {resumen.truncado && (
            <p className="rounded-xl border p-3 text-sm">
              Hay más visitas de las que se pudieron leer de una vez: los números pueden estar incompletos. Elegí un período más corto.
            </p>
          )}
          <TarjetasVisitas metricas={resumen.metricas} etiquetaPeriodo={periodo.ok ? periodo.periodo.etiqueta : ''} />
          <div className="grid gap-4 lg:grid-cols-2">
            <AgendaVisitas agenda={resumen.agenda} mostrarAsesor={verTodo} hrefTodas={hrefTodas} />
            <RequierenAccion requieren={resumen.requieren} mostrarAsesor={verTodo} onCambio={recargar} />
          </div>
          <ComoVienen metricas={resumen.metricas} mostrarAsesor={verTodo} opiniones={resumen.opiniones} />
        </>
      )}
    </div>
  )
}

'use client'

/**
 * Sección Consultas, pestaña Bandeja (spec §3.2): las tres tarjetas "para
 * atender", los filtros, la lista por día y el detalle. Las cuentas y el estado
 * de cada consulta los decide el servidor (GET /api/consultas →
 * lib/consultas/bandeja.ts); esta pantalla pide, junta páginas y compone.
 *
 * Filtros en la dirección (lib/filters/use-filtros-url): se puede compartir el
 * link y el botón Atrás funciona.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { AgendarVisitaDialog } from '@/components/visitas/agendar/AgendarVisitaDialog'
import { TarjetasAtender, type TarjetaAtender } from '@/components/consultas/TarjetasAtender'
import { FiltrosConsultas, type ValoresFiltrosConsultas } from '@/components/consultas/FiltrosConsultas'
import { ListaConsultas } from '@/components/consultas/ListaConsultas'
import { DetalleConsulta } from '@/components/consultas/DetalleConsulta'
import {
  ESTADOS_FILTRO, FILTROS_DEFECTO_CONSULTAS, PERIODOS_CONSULTAS, PORTALES_FILTRO, TELEFONO_REVISAR,
} from '@/lib/consultas/filtros'
import { contarFiltrosActivos, inicioRapidoDe, otrasDeLaPersona, unirSinRepetir } from '@/lib/consultas/pantalla'
import { esFechaValida } from '@/lib/visitas/periodo'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import { normalizarBusqueda } from '@/lib/filters/busqueda-texto'
import { esRol, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { AccionAgendar, ConsultaEnBandeja, RespuestaBandeja } from '@/lib/consultas/tipos'

// Constantes de MÓDULO: dentro del componente cambiarían de identidad en cada
// render y el hook de filtros re-pediría sin parar.
const PERMITIDOS = {
  periodo: [...PERIODOS_CONSULTAS],
  portal: ['', ...PORTALES_FILTRO],
  estado: ['', ...ESTADOS_FILTRO],
  telefono: ['', TELEFONO_REVISAR],
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** uuid o `sin`; otra cosa, sin filtro. Idempotente (lo exige useFiltrosUrl). */
function idOSin(v: string): string {
  const limpio = v.trim()
  if (limpio === 'sin') return 'sin'
  return UUID_RE.test(limpio) ? limpio.toLowerCase() : ''
}

function normalizar(f: ValoresFiltrosConsultas): ValoresFiltrosConsultas {
  return {
    ...f,
    from: esFechaValida(f.from) ? f.from : '',
    to: esFechaValida(f.to) ? f.to : '',
    propiedad: idOSin(f.propiedad),
    asesor: idOSin(f.asesor),
    q: normalizarBusqueda(f.q),
  }
}

const POR_ACCION: Record<Exclude<AccionAgendar, 'agendar'>, string> = {
  elegir_propiedad: 'Primero hay que identificar qué propiedad miró.',
  revisar_telefono: 'Primero hay que revisar el teléfono que dejó.',
  pedir_telefono: 'Primero hay que conseguir su teléfono.',
}

type Identidad = { id: string; rol: string } | null

function leerIdentidad(d: unknown): Identidad {
  if (!d || typeof d !== 'object') return null
  const id = 'id' in d && typeof d.id === 'string' ? d.id : null
  const rol = 'role' in d && typeof d.role === 'string' ? d.role : null
  return id && rol ? { id, rol } : null
}

function esBandeja(v: unknown): v is RespuestaBandeja {
  return !!v && typeof v === 'object' && 'filas' in v && Array.isArray(v.filas) && 'total' in v && typeof v.total === 'number'
}

/**
 * GET /api/consultas devuelve la bandeja sin envolver en `{ data }`, así que no
 * sirve `leerRespuesta` tal cual. Igual de tolerante: un 504 de Netlify es HTML
 * y `res.json()` explotaría con `Unexpected token '<'`.
 */
async function leerBandeja(res: Response): Promise<{ ok: true; data: RespuestaBandeja } | { ok: false; error: string }> {
  let cuerpo: unknown = null
  try { cuerpo = await res.json() } catch { /* HTML de error del gateway */ }
  if (res.ok && esBandeja(cuerpo)) return { ok: true, data: cuerpo }
  if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo && typeof cuerpo.error === 'string') {
    return { ok: false, error: cuerpo.error }
  }
  if (res.status === 504) return { ok: false, error: 'El servidor tardó demasiado. Probá de nuevo.' }
  return { ok: false, error: 'Algo falló. Probá de nuevo.' }
}

function urlDeBandeja(f: ValoresFiltrosConsultas, verAsesor: boolean, pagina: number): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (!v) continue
    if (k === 'asesor' && !verAsesor) continue
    qs.set(k, v)
  }
  qs.set('pagina', String(pagina))
  return `/api/consultas?${qs}`
}

interface Datos {
  clave: string
  bandeja: RespuestaBandeja
  /** Páginas ya juntadas: "Ver más" pide la siguiente y el refresco las vuelve a pedir todas. */
  paginas: number
}

export function ConsultasClient() {
  const { filtros: mostrado, aplicados: filtros, aplicar, limpiar } = useFiltrosUrl({
    defectos: FILTROS_DEFECTO_CONSULTAS, permitidos: PERMITIDOS, normalizar,
  })
  const [identidad, setIdentidad] = useState<Identidad | 'cargando'>('cargando')
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recarga, setRecarga] = useState(0)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [errorMas, setErrorMas] = useState<string | null>(null)
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [consultaAgendando, setConsultaAgendando] = useState<ConsultaEnBandeja | null>(null)
  const [faltaUnPaso, setFaltaUnPaso] = useState<ConsultaEnBandeja | null>(null)
  const [hojaFiltros, setHojaFiltros] = useState(false)
  const pedidos = usePedidosVersionados()
  const hoy = useMemo(() => fechaEnArgentina(new Date()), [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => setIdentidad(leerIdentidad(d)))
      .catch(() => setIdentidad(null))
  }, [])

  const yo = identidad === 'cargando' ? null : identidad
  const verTodo = !!yo && esRol(yo.rol) && puedeVerTodasLasVisitas(yo.rol)

  useEffect(() => {
    if (!verTodo) return
    fetch('/api/users/advisors')
      .then((r) => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then((r) => { if (r.ok) setAsesores(r.data ?? []) })
      .catch(() => {})
  }, [verTodo])

  // Lo que identifica al listado: si cambia, las páginas juntadas son de otro
  // filtro y no se mezclan con las nuevas.
  const clave = urlDeBandeja(filtros, verTodo, 1)

  useEffect(() => {
    if (identidad === 'cargando') return
    const { gen, signal } = pedidos.abrir()
    setCargando(true)
    setErrorMas(null)
    fetch(clave, { signal })
      .then(leerBandeja)
      .then((r) => {
        if (!pedidos.vigente(gen)) return
        if (r.ok) { setDatos({ clave, bandeja: r.data, paginas: 1 }); setError(null) }
        else setError(r.error)
      })
      .catch(() => { if (pedidos.vigente(gen)) setError('No hay conexión. Probá de nuevo.') })
      .finally(() => pedidos.siVigente(gen, () => setCargando(false)))
    // `clave` resume filtros + quién mira; `recarga` fuerza un pedido nuevo (Reintentar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, identidad, recarga])

  // Regla del tablero: una bandeja de OTRO filtro no se muestra como si fuera esta.
  const bandeja = datos && datos.clave === clave ? datos.bandeja : null
  const filas = bandeja?.filas ?? []

  async function verMas() {
    if (!datos || datos.clave !== clave) return
    const { gen, signal } = pedidos.actual()
    const pagina = datos.paginas + 1
    setCargandoMas(true)
    setErrorMas(null)
    try {
      const r = await leerBandeja(await fetch(urlDeBandeja(filtros, verTodo, pagina), { signal }))
      if (!pedidos.vigente(gen)) return
      if (!r.ok) { setErrorMas(r.error); return }
      setDatos((d) => d && d.clave === clave
        ? { ...d, paginas: pagina, bandeja: { ...r.data, filas: unirSinRepetir(d.bandeja.filas, r.data.filas) } }
        : d)
    } catch {
      if (pedidos.vigente(gen)) setErrorMas('No hay conexión. Probá de nuevo.')
    } finally {
      setCargandoMas(false)
    }
  }

  /**
   * Después de agendar: se vuelven a pedir TODAS las páginas ya mostradas, así la
   * fila agendada pasa a "Visita …" sin que la lista se achique a 25.
   */
  async function refrescar() {
    if (!datos || datos.clave !== clave) { setRecarga((n) => n + 1); return }
    const { gen, signal } = pedidos.actual()
    const paginas = datos.paginas
    try {
      const respuestas = await Promise.all(
        Array.from({ length: paginas }, (_, i) => fetch(urlDeBandeja(filtros, verTodo, i + 1), { signal }).then(leerBandeja)),
      )
      if (!pedidos.vigente(gen)) return
      const fallida = respuestas.find((r) => !r.ok)
      if (fallida && !fallida.ok) { setErrorMas(`No pudimos actualizar la lista: ${fallida.error}`); return }
      let juntas: ConsultaEnBandeja[] = []
      let primera: RespuestaBandeja | null = null
      for (const r of respuestas) {
        if (!r.ok) continue
        primera ??= r.data
        juntas = unirSinRepetir(juntas, r.data.filas)
      }
      if (primera) {
        const base = primera
        setDatos({ clave, paginas, bandeja: { ...base, filas: juntas } })
      }
    } catch {
      if (pedidos.vigente(gen)) setErrorMas('No pudimos actualizar la lista. Recargá la página.')
    }
  }

  /**
   * Despacho del botón "Agendar visita" según lo que la consulta necesita. Solo
   * `agendar` tiene todo para abrir la ventana en modo rápido; los otros pasos
   * (elegir propiedad, revisar o pedir teléfono) llegan con la Tarea 10.
   */
  function abrirAgendar(c: ConsultaEnBandeja) {
    setDetalleAbierto(false)
    if (c.accion === 'agendar' && c.property_id) setConsultaAgendando(c)
    else setFaltaUnPaso(c)
  }

  function abrirDetalle(c: ConsultaEnBandeja) {
    setSeleccionadaId(c.id)
    setDetalleAbierto(true)
  }

  const activas: Record<TarjetaAtender, boolean> = {
    sinVisita: filtros.estado === 'sin_visita',
    sinPropiedad: filtros.propiedad === 'sin',
    telefonoRevisar: filtros.telefono === TELEFONO_REVISAR,
  }
  function tocarTarjeta(t: TarjetaAtender) {
    if (t === 'sinVisita') aplicar({ estado: activas.sinVisita ? '' : 'sin_visita' })
    else if (t === 'sinPropiedad') aplicar({ propiedad: activas.sinPropiedad ? '' : 'sin' })
    else aplicar({ telefono: activas.telefonoRevisar ? '' : TELEFONO_REVISAR })
  }

  const nFiltros = contarFiltrosActivos(filtros)
  const seleccionada = filas.find((f) => f.id === seleccionadaId) ?? null
  const filtrosProps = {
    valores: mostrado,
    porPortal: bandeja?.porPortal ?? [],
    porPropiedad: bandeja?.porPropiedad ?? [],
    asesores: verTodo ? asesores : null,
    hayFiltros: nFiltros > 0,
    onCambio: (cambio: Partial<ValoresFiltrosConsultas>) => { aplicar(cambio) },
    onLimpiar: () => { limpiar() },
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold">Consultas</h1>
          <p className="hidden text-sm text-muted-foreground md:block">
            Todo lo que entra por los portales, de la más nueva a la más vieja.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div role="tablist" aria-label="Vista" className="flex flex-1 gap-1 rounded-lg bg-muted p-1 md:flex-none">
            <button type="button" role="tab" aria-selected="true"
              className="min-h-11 flex-1 rounded-md bg-background px-4 text-sm font-semibold shadow-sm md:min-h-9">
              Bandeja
            </button>
            <button type="button" role="tab" aria-selected="false" disabled
              className="min-h-11 flex-1 rounded-md px-4 text-sm text-muted-foreground disabled:cursor-not-allowed md:min-h-9">
              Estadísticas <span className="text-xs">· Próximamente</span>
            </button>
          </div>
          <Button type="button" variant="outline" className="min-h-11 md:hidden" onClick={() => setHojaFiltros(true)}>
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            {nFiltros > 0 ? `Filtros · ${nFiltros}` : 'Filtros'}
          </Button>
        </div>
      </header>

      {bandeja && (
        <TarjetasAtender tarjetas={bandeja.tarjetas} activas={activas}
          etiquetaPeriodo={bandeja.periodo.etiqueta} onTocar={tocarTarjeta} />
      )}

      <section aria-label="Filtros" className="hidden rounded-xl border bg-card p-4 md:block">
        <FiltrosConsultas {...filtrosProps} />
      </section>

      <Sheet open={hojaFiltros} onOpenChange={setHojaFiltros}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-3 p-4">
          <SheetTitle>Filtros</SheetTitle>
          <FiltrosConsultas {...filtrosProps} />
          <Button type="button" className="min-h-11" onClick={() => setHojaFiltros(false)}>
            {bandeja ? `Ver ${bandeja.total} consultas` : 'Listo'}
          </Button>
        </SheetContent>
      </Sheet>

      <p role="status" aria-live="polite" className="sr-only">{cargando ? 'Actualizando las consultas' : ''}</p>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 p-4 text-sm">
          <span>{error}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setRecarga((n) => n + 1)}>Reintentar</Button>
        </div>
      )}

      {!bandeja && !error && (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {bandeja?.truncado && (
        <p className="rounded-xl border p-3 text-sm">
          Hay más consultas de las que se pudieron leer de una vez: los números pueden estar incompletos. Elegí un período más corto.
        </p>
      )}

      {bandeja && filas.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          <p>{nFiltros > 0 ? 'Ninguna consulta coincide con estos filtros.' : 'No hay consultas en este período.'}</p>
          {nFiltros > 0 && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => limpiar()}>Limpiar filtros</Button>
          )}
        </div>
      )}

      {bandeja && filas.length > 0 && (
        <ListaConsultas
          filas={filas}
          total={bandeja.total}
          hoy={hoy}
          seleccionadaId={detalleAbierto ? seleccionadaId : null}
          cargandoMas={cargandoMas}
          errorMas={errorMas}
          onAbrir={abrirDetalle}
          onAgendar={abrirAgendar}
          onVerMas={verMas}
        />
      )}

      <DetalleConsulta
        consulta={seleccionada}
        otras={seleccionada ? otrasDeLaPersona(seleccionada, filas) : []}
        abierto={detalleAbierto}
        onCerrar={() => setDetalleAbierto(false)}
        onAgendar={abrirAgendar}
      />

      {consultaAgendando && consultaAgendando.property_id && (
        <AgendarVisitaDialog
          // key: cambiar de consulta REMONTA la ventana; con el diálogo abierto un
          // `rapido` nuevo no se tomaría (lo dejó anotado la revisión de la Tarea 7).
          key={consultaAgendando.id}
          open
          onOpenChange={(o) => { if (!o) setConsultaAgendando(null) }}
          propiedadId={consultaAgendando.property_id}
          rapido={inicioRapidoDe(consultaAgendando)}
          onAgendada={() => { setConsultaAgendando(null); void refrescar() }}
        />
      )}

      <Dialog open={faltaUnPaso !== null} onOpenChange={(o) => { if (!o) setFaltaUnPaso(null) }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Falta un paso</DialogTitle>
            <DialogDescription>
              Esta consulta necesita un paso más antes de agendar (próximamente).
              {faltaUnPaso && faltaUnPaso.accion !== 'agendar' ? ` ${POR_ACCION[faltaUnPaso.accion]}` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" className="min-h-11" onClick={() => setFaltaUnPaso(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

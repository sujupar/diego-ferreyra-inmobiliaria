'use client'

/**
 * Sección Consultas: Bandeja y Estadísticas.
 *
 * Velocidad (spec Entrega 2 §3.1): el período ENTERO llega con la página (lo
 * arma el servidor en `page.tsx`) y todo lo demás se calcula acá, en memoria:
 * filtros, búsqueda, "Ver más", tarjetas y estadísticas. Cada pedido a la
 * plataforma cuesta ~1 s de piso, así que lo único que vuelve a pedir es
 * CAMBIAR el período, y un período ya visto queda guardado.
 *
 * Los filtros viven en la dirección (se puede compartir el link y Atrás anda),
 * escritos con `soloNavegador`: con el router de Next cada filtro volvía a
 * pedirle la página al servidor.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { TarjetasAtender, type TarjetaAtender } from '@/components/consultas/TarjetasAtender'
import { FiltrosConsultas, type ValoresFiltrosConsultas } from '@/components/consultas/FiltrosConsultas'
import { ListaConsultas } from '@/components/consultas/ListaConsultas'
import { DetalleConsulta } from '@/components/consultas/DetalleConsulta'
import { AgendarDesdeConsulta } from '@/components/consultas/AgendarDesdeConsulta'
import { HojaAvisosSinPropiedad } from '@/components/consultas/HojaAvisosSinPropiedad'
import { EstadisticasConsultas } from '@/components/consultas/EstadisticasConsultas'
import {
  ESTADOS_FILTRO, FILTROS_DEFECTO_CONSULTAS, PERIODOS_CONSULTAS, PORTALES_FILTRO, TELEFONO_REVISAR, leerFiltrosConsultas,
} from '@/lib/consultas/filtros'
import { contarFiltrosActivos, otrasDeLaPersona } from '@/lib/consultas/pantalla'
import { vistaBandeja, filtrarConsultas, SIN_FILTROS, type FiltrosVista } from '@/lib/consultas/vista'
import { POR_PAGINA } from '@/lib/consultas/bandeja'
import { resumenSinPropiedad } from '@/lib/consultas/avisos'
import { calcularEstadisticas } from '@/lib/consultas/estadisticas'
import { esFechaValida } from '@/lib/visitas/periodo'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import { normalizarBusqueda } from '@/lib/filters/busqueda-texto'
import { esRol, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { ConsultaEnBandeja, PeriodoConsultas } from '@/lib/consultas/tipos'

// Constantes de MÓDULO: dentro del componente cambiarían de identidad en cada
// render y el hook de filtros entraría en un loop.
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

/** Los únicos que conectan un aviso con su propiedad (igual que las rutas de conexión). */
const ROLES_QUE_IDENTIFICAN = ['admin', 'dueno', 'coordinador']

export interface Yo { id: string; rol: string }
export interface AsesorOpcion { id: string; full_name: string }

const clavePeriodo = (desde: string, hasta: string) => `${desde}|${hasta}`

function paramsDelPeriodo(f: ValoresFiltrosConsultas): string {
  const qs = new URLSearchParams()
  for (const k of ['periodo', 'from', 'to'] as const) if (f[k]) qs.set(k, f[k])
  return qs.toString()
}

function esPeriodo(v: unknown): v is PeriodoConsultas {
  return !!v && typeof v === 'object' && 'consultas' in v && Array.isArray(v.consultas)
    && 'periodo' in v && !!v.periodo && typeof v.periodo === 'object'
}

/** Tolerante: un 504 de Netlify es HTML y `res.json()` explotaría con `Unexpected token '<'`. */
async function leerPeriodo(res: Response): Promise<{ ok: true; data: PeriodoConsultas } | { ok: false; error: string }> {
  let cuerpo: unknown = null
  try { cuerpo = await res.json() } catch { /* HTML de error del gateway */ }
  if (res.ok && esPeriodo(cuerpo)) return { ok: true, data: cuerpo }
  if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo && typeof cuerpo.error === 'string') {
    return { ok: false, error: cuerpo.error }
  }
  if (res.status === 504) return { ok: false, error: 'El servidor tardó demasiado. Probá de nuevo.' }
  return { ok: false, error: 'Algo falló. Probá de nuevo.' }
}

export function ConsultasClient({ yo, asesores, inicial, errorInicial, abrirAvisos = false }: {
  yo: Yo
  asesores: AsesorOpcion[]
  /** El período de la dirección, armado en el servidor; null si falló al leerlo. */
  inicial: PeriodoConsultas | null
  errorInicial: string | null
  /** Abrir de entrada la hoja "Avisos sin propiedad" (`?avisos=1`). */
  abrirAvisos?: boolean
}) {
  const { filtros: mostrado, aplicados, aplicar, limpiar } = useFiltrosUrl({
    defectos: FILTROS_DEFECTO_CONSULTAS, permitidos: PERMITIDOS, normalizar, soloNavegador: true,
  })
  const hoy = useMemo(() => fechaEnArgentina(new Date()), [])
  const verTodo = esRol(yo.rol) && puedeVerTodasLasVisitas(yo.rol)
  const puedeIdentificar = ROLES_QUE_IDENTIFICAN.includes(yo.rol)

  const leidos = useMemo(() => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(aplicados)) if (v) sp.set(k, v)
    return leerFiltrosConsultas(sp, hoy)
  }, [aplicados, hoy])
  const filtrosVista: FiltrosVista = leidos.ok ? leidos.valor : SIN_FILTROS

  // Períodos ya traídos, por `desde|hasta`. El que vino con la página entra primero.
  const [periodos, setPeriodos] = useState<ReadonlyMap<string, PeriodoConsultas>>(() =>
    inicial ? new Map([[clavePeriodo(inicial.periodo.desde, inicial.periodo.hasta), inicial]]) : new Map())
  // Si el servidor no pudo leer el período al armar la página, el error queda
  // anotado para ESE período: se muestra y se espera "Reintentar" (no se vuelve
  // a pedir solo, que repetiría el mismo fallo sin que nadie lo vea).
  const [errores, setErrores] = useState<ReadonlyMap<string, string>>(() =>
    !inicial && errorInicial && leidos.ok
      ? new Map([[clavePeriodo(leidos.valor.desde, leidos.valor.hasta), errorInicial]])
      : new Map())
  const [ultimoMostrado, setUltimoMostrado] = useState<PeriodoConsultas | null>(inicial)

  const claveActual = leidos.ok ? clavePeriodo(leidos.valor.desde, leidos.valor.hasta) : null
  // El período que se está MIRANDO, leído por las respuestas que llegan tarde:
  // una respuesta de otro período se guarda (si salió bien) pero no toca la vista.
  const claveVista = useRef(claveActual)
  useEffect(() => { claveVista.current = claveActual }, [claveActual])

  const periodoActual = claveActual ? periodos.get(claveActual) ?? null : null
  // Mientras llega un período nuevo se sigue viendo el ÚLTIMO que se mostró
  // (atenuado), nunca la pantalla vacía. Se ajusta durante el render (patrón de
  // React para estado derivado de props/estado): así, al volver a un período
  // guardado y pedir otro, lo que queda a la vista es el que se estaba mirando.
  if (periodoActual && periodoActual !== ultimoMostrado) setUltimoMostrado(periodoActual)
  const errorDelPeriodo = claveActual ? errores.get(claveActual) ?? null : null
  // Sin el período pedido y con error: se muestra SOLO el error. Dejar a la
  // vista los datos del período anterior haría creer que son los del nuevo.
  const errorPeriodo = !leidos.ok ? leidos.error : !periodoActual ? errorDelPeriodo : null
  // Con el período a la vista y un error: falló la ACTUALIZACIÓN (después de
  // agendar o conectar). La lista sigue, pero puede estar vieja: se avisa.
  const errorActualizar = periodoActual ? errorDelPeriodo : null
  const periodo = errorPeriodo ? null : periodoActual ?? ultimoMostrado
  const cargandoPeriodo = !!claveActual && !periodoActual && !errorPeriodo
  const qsPeriodo = paramsDelPeriodo(aplicados)

  async function pedirPeriodo(clave: string, qs: string): Promise<void> {
    const anotarError = (mensaje: string) => {
      // Un fallo de un período que ya no se mira no se anota: si la persona
      // vuelve a él, se pide de nuevo en vez de mostrarle un error viejo.
      if (clave === claveVista.current) setErrores((m) => new Map(m).set(clave, mensaje))
    }
    try {
      const r = await leerPeriodo(await fetch(`/api/consultas${qs ? `?${qs}` : ''}`))
      if (r.ok) {
        // Se guarda aunque ya no sea el que se mira: si la persona vuelve a ese período, está.
        setPeriodos((m) => new Map(m).set(clave, r.data))
        if (clave === claveVista.current) setUltimoMostrado(r.data)
        setErrores((m) => { if (!m.has(clave)) return m; const c = new Map(m); c.delete(clave); return c })
      } else {
        anotarError(r.error)
      }
    } catch {
      anotarError('No hay conexión. Probá de nuevo.')
    }
  }

  useEffect(() => {
    if (!claveActual || periodos.has(claveActual) || errores.has(claveActual)) return
    void pedirPeriodo(claveActual, qsPeriodo)
    // Solo cuando cambia el período; `periodos` y `errores` se leen al momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveActual])

  /**
   * Después de agendar o conectar: se vuelve a pedir el período a la vista, y los
   * demás guardados se descartan (pueden mostrar una consulta sin la visita que
   * se acaba de agendar), con sus errores. La lista no se vacía mientras tanto.
   */
  function refrescar() {
    if (!claveActual) return
    const clave = claveActual
    setPeriodos((m) => { const c = new Map<string, PeriodoConsultas>(); const actual = m.get(clave); if (actual) c.set(clave, actual); return c })
    setErrores(new Map())
    void pedirPeriodo(clave, qsPeriodo)
  }

  function reintentar() {
    if (!claveActual) return
    const clave = claveActual
    setErrores((m) => { const c = new Map(m); c.delete(clave); return c })
    void pedirPeriodo(clave, qsPeriodo)
  }

  const [pestana, setPestana] = useState<'bandeja' | 'estadisticas'>('bandeja')
  const [visibles, setVisibles] = useState({ clave: '', n: POR_PAGINA })
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [consultaAgendando, setConsultaAgendando] = useState<ConsultaEnBandeja | null>(null)
  const [hojaFiltros, setHojaFiltros] = useState(false)
  // `/consultas?avisos=1` (la dirección vieja `/avisos` y el cartel de Inicio)
  // llega con la hoja abierta. Solo para quien puede conectar.
  const [hojaAvisos, setHojaAvisos] = useState(() => abrirAvisos && puedeIdentificar)
  function cerrarHojaAvisos() {
    setHojaAvisos(false)
    // Sin `avisos=1` en la dirección, recargar no la vuelve a abrir. Estado
    // `null`: con el de Next, `useSearchParams` no se entera (ver CLAUDE.md § Consultas E2).
    const url = new URL(window.location.href)
    if (url.searchParams.has('avisos')) {
      url.searchParams.delete('avisos')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }

  // "Ver más" vale para ESTE filtro: al cambiar cualquier filtro vuelve a 25.
  const claveFiltros = JSON.stringify({ ...aplicados, periodoMostrado: periodo?.periodo.desde ?? '' })
  const cuantas = visibles.clave === claveFiltros ? visibles.n : POR_PAGINA

  const consultas = useMemo(() => periodo?.consultas ?? [], [periodo])
  const direccionElegida = useMemo(() => {
    if (!filtrosVista.propiedad || filtrosVista.propiedad === 'sin') return null
    return consultas.find((c) => c.property_id === filtrosVista.propiedad)?.propiedad?.address ?? null
  }, [consultas, filtrosVista.propiedad])
  const vista = useMemo(
    () => (periodo ? vistaBandeja(consultas, filtrosVista, { verTodo, visibles: cuantas, direccionElegida }) : null),
    // filtrosVista se deriva de `leidos`: se usa su identidad estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodo, consultas, leidos, verTodo, cuantas, direccionElegida],
  )
  const estadisticas = useMemo(
    () => (periodo && pestana === 'estadisticas'
      ? calcularEstadisticas(filtrarConsultas(consultas, filtrosVista, verTodo), periodo.periodo, verTodo)
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodo, consultas, leidos, verTodo, pestana],
  )
  const sinPropiedad = useMemo(() => resumenSinPropiedad(consultas), [consultas])

  function abrirAgendar(c: ConsultaEnBandeja) {
    setDetalleAbierto(false)
    setConsultaAgendando(c)
  }

  function abrirDetalle(c: ConsultaEnBandeja) {
    setSeleccionadaId(c.id)
    setDetalleAbierto(true)
  }

  const activas: Record<TarjetaAtender, boolean> = {
    sinVisita: aplicados.estado === 'sin_visita',
    sinPropiedad: aplicados.propiedad === 'sin',
    telefonoRevisar: aplicados.telefono === TELEFONO_REVISAR,
  }
  function tocarTarjeta(t: TarjetaAtender) {
    if (t === 'sinVisita') aplicar({ estado: activas.sinVisita ? '' : 'sin_visita' })
    else if (t === 'sinPropiedad') aplicar({ propiedad: activas.sinPropiedad ? '' : 'sin' })
    else aplicar({ telefono: activas.telefonoRevisar ? '' : TELEFONO_REVISAR })
  }

  const nFiltros = contarFiltrosActivos(aplicados)
  const filas = vista?.filas ?? []
  const seleccionada = consultas.find((f) => f.id === seleccionadaId) ?? null
  const filtrosProps = {
    valores: mostrado,
    porPortal: vista?.porPortal ?? [],
    porPropiedad: vista?.porPropiedad ?? [],
    asesores: verTodo ? asesores : null,
    hayFiltros: nFiltros > 0,
    onCambio: (cambio: Partial<ValoresFiltrosConsultas>) => { aplicar(cambio) },
    onLimpiar: () => { limpiar() },
  }
  const etiquetaPeriodo = periodo?.periodo.etiqueta ?? ''

  return (
    <div className="space-y-4">
      {/* Barra fina arriba mientras llega un período nuevo. */}
      <div aria-hidden="true" className={`fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden ${cargandoPeriodo ? '' : 'hidden'}`}>
        <div className="h-full w-1/3 animate-[pulse_1s_ease-in-out_infinite] bg-brand" />
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold">Consultas</h1>
          <p className="hidden text-sm text-muted-foreground md:block">
            Todo lo que entra por los portales y las landings, de la más nueva a la más vieja.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div role="tablist" aria-label="Vista" className="flex flex-1 gap-1 rounded-lg bg-muted p-1 md:flex-none">
            {(['bandeja', 'estadisticas'] as const).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}
                className={`min-h-11 flex-1 rounded-md px-4 text-sm md:min-h-9 ${pestana === p ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}`}>
                {p === 'bandeja' ? 'Bandeja' : 'Estadísticas'}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" className="min-h-11 md:hidden" onClick={() => setHojaFiltros(true)}>
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            {nFiltros > 0 ? `Filtros · ${nFiltros}` : 'Filtros'}
          </Button>
        </div>
      </header>

      {pestana === 'bandeja' && vista && (
        <TarjetasAtender tarjetas={vista.tarjetas} activas={activas} etiquetaPeriodo={etiquetaPeriodo} onTocar={tocarTarjeta} />
      )}

      {puedeIdentificar && sinPropiedad.consultas > 0 && (
        <div role="note" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {sinPropiedad.consultas === 1 ? '1 consulta' : `${sinPropiedad.consultas} consultas`}
            {sinPropiedad.avisos > 0 && ` de ${sinPropiedad.avisos === 1 ? '1 aviso' : `${sinPropiedad.avisos} avisos`}`}
            {sinPropiedad.consultas === 1 ? ' no tiene propiedad' : ' no tienen propiedad'} ({etiquetaPeriodo.toLowerCase()})
          </span>
          <Button type="button" className="min-h-11 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setHojaAvisos(true)}>
            Conectar avisos
          </Button>
        </div>
      )}

      <section aria-label="Filtros" className="hidden rounded-xl border bg-card p-4 md:block">
        <FiltrosConsultas {...filtrosProps} />
      </section>

      <Sheet open={hojaFiltros} onOpenChange={setHojaFiltros}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-3 p-4">
          <SheetTitle>Filtros</SheetTitle>
          {/* Radix avisa en consola si la hoja no tiene descripción. */}
          <SheetDescription className="sr-only">Elegí qué consultas ver.</SheetDescription>
          <FiltrosConsultas {...filtrosProps} />
          <Button type="button" className="min-h-11" onClick={() => setHojaFiltros(false)}>
            {vista ? `Ver ${vista.total} consultas` : 'Listo'}
          </Button>
        </SheetContent>
      </Sheet>

      <p role="status" aria-live="polite" className="sr-only">{cargandoPeriodo ? 'Actualizando las consultas' : ''}</p>

      {errorPeriodo && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 p-4 text-sm">
          <span>{errorPeriodo}</span>
          {leidos.ok && <Button type="button" variant="outline" className="min-h-11" onClick={reintentar}>Reintentar</Button>}
        </div>
      )}

      {errorActualizar && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 p-3 text-sm">
          <span>No pudimos actualizar la lista ({errorActualizar}). Lo que ves puede no incluir el último cambio.</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={reintentar}>Reintentar</Button>
        </div>
      )}

      {!periodo && !errorPeriodo && (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {periodo?.truncado && (
        <p className="rounded-xl border p-3 text-sm">
          Mostrando las 3.000 consultas más recientes del período: elegí un período más corto para ver todas.
        </p>
      )}

      <div className={cargandoPeriodo ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={cargandoPeriodo}>
        {pestana === 'estadisticas' && estadisticas && periodo && (
          <EstadisticasConsultas
            e={estadisticas}
            etiquetaPeriodo={etiquetaPeriodo}
            onPropiedad={(id) => { aplicar({ propiedad: id }); setPestana('bandeja') }}
            onSinPropiedad={() => {
              if (puedeIdentificar) setHojaAvisos(true)
              else { aplicar({ propiedad: 'sin' }); setPestana('bandeja') }
            }}
          />
        )}

        {pestana === 'bandeja' && vista && filas.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            <p>{nFiltros > 0 ? 'Ninguna consulta coincide con estos filtros.' : 'No hay consultas en este período.'}</p>
            {nFiltros > 0 && (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => limpiar()}>Limpiar filtros</Button>
            )}
          </div>
        )}

        {pestana === 'bandeja' && vista && filas.length > 0 && (
          <ListaConsultas
            filas={filas}
            total={vista.total}
            hoy={hoy}
            seleccionadaId={detalleAbierto ? seleccionadaId : null}
            cargandoMas={false}
            errorMas={null}
            onAbrir={abrirDetalle}
            onAgendar={abrirAgendar}
            onVerMas={() => setVisibles({ clave: claveFiltros, n: cuantas + POR_PAGINA })}
          />
        )}
      </div>

      <DetalleConsulta
        consulta={seleccionada}
        otras={seleccionada ? otrasDeLaPersona(seleccionada, consultas) : []}
        abierto={detalleAbierto}
        onCerrar={() => setDetalleAbierto(false)}
        onAgendar={abrirAgendar}
      />

      {consultaAgendando && (
        <AgendarDesdeConsulta
          // key: otra consulta arranca la máquina de cero (paso, propiedad, teléfono).
          key={consultaAgendando.id}
          consulta={consultaAgendando}
          puedeIdentificar={puedeIdentificar}
          asesores={asesores}
          onTerminado={() => { setConsultaAgendando(null); refrescar() }}
          onCerrar={(cambio) => { setConsultaAgendando(null); if (cambio) refrescar() }}
        />
      )}

      {hojaAvisos && (
        <HojaAvisosSinPropiedad asesores={asesores} onConectado={refrescar} onCerrar={cerrarHojaAvisos} />
      )}
    </div>
  )
}

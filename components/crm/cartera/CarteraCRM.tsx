'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import {
  agrupar,
  contarPorEtapa,
  filtrarFilas,
  ordenarFilas,
  type FilaCartera,
  type FiltrosCartera,
  type Grupo,
} from '@/lib/crm/cartera'
import { calcularTrabado } from '@/lib/crm/cartera-trabado'
import { FILTROS_DEFECTO, leerFiltrosCartera } from '@/lib/crm/cartera-url'
import type { Vista } from '@/lib/crm/cartera-vista'
import { etapasDeVista, hayFiltros, ORDENES, textoPie } from '@/lib/crm/cartera-pantalla'
import { estaAbierto, type EtapaCRM } from '@/lib/crm/etapas'
import { leerJson } from '@/lib/crm/leer-json'
import type { DatosCartera } from '@/lib/supabase/cartera'
import { cn } from '@/lib/utils'
import { CampoSelect } from '../ui/CampoSelect'
import { BarraEtapas } from './BarraEtapas'
import { AvisoVerComo, CabeceraCartera, SelectorVerComo } from './CabeceraCartera'
import {
  AvisoFuente,
  AvisoSuave,
  CargandoCartera,
  ErrorCartera,
  NadaUrgente,
  VacioConFiltros,
  VacioSinNada,
} from './EstadosCartera'
import { FiltrosLista, type ConfigFiltros } from './FiltrosCartera'
import { GrupoCartera } from './GrupoCartera'
import { LoTrabado } from './LoTrabado'
import { DE_A, PieCartera } from './PieCartera'
import { SegmentoAbiertos } from './SegmentoAbiertos'
import {
  metaDeGrupo,
  subtituloDe,
  TEXTO_ERROR_TAREAS,
  TEXTO_ERROR_ULTIMO,
  TEXTO_PERSONA_INVALIDA,
  TEXTO_TOPE,
  textoNoSeAplico,
  type TipoVista,
} from './textos'

// La cartera del CRM (D4, D7, D8 y D11). Llega con los datos ya armados por el servidor
// (`page.tsx`) y filtra, agrupa, ordena y pagina EN MEMORIA: lo único que vuelve a pedir
// datos es "Reintentar", "Ver como" y volver a la pestaña después de 5 minutos.
//
// Los filtros viven en la dirección con `useFiltrosUrl({ soloNavegador: true })`
// (`history.replaceState(null, …)`): cambiar un filtro no vuelve a pedir la página
// (CLAUDE.md, "Sección Consultas — Entrega 2").

const REFRESCO_MS = 5 * 60_000

/** El hook exige `Record<string, string>`; una interfaz no lo cumple, un tipo mapeado sí. */
type FiltrosUrlCartera = { [K in keyof FiltrosCartera]: FiltrosCartera[K] }
const DEFECTOS: FiltrosUrlCartera = { ...FILTROS_DEFECTO }

/**
 * Las listas válidas de la vista que se está mirando (asesores, etapas, personas de "Ver
 * como"). Van en un objeto de MÓDULO que `normalizarCartera` lee: si la función cambiara
 * de identidad con cada lista nueva, el hook entraría en un bucle (use-filtros-url.ts, la
 * guarda de opciones estables). Se actualiza en cada render, antes de llamar al hook.
 */
const PERMITIDOS: { actual: { asesores: string[]; etapas: EtapaCRM[]; verComo: string[] } } = {
  actual: { asesores: [], etapas: [], verComo: [] },
}
function fijarPermitidos(p: { asesores: string[]; etapas: EtapaCRM[]; verComo: string[] }) {
  PERMITIDOS.actual = p
}
function normalizarCartera(f: FiltrosUrlCartera): FiltrosUrlCartera {
  return leerFiltrosCartera(new URLSearchParams(f), PERMITIDOS.actual).filtros
}

const TODAS: Record<EtapaCRM, number> = {
  solicitud: 1, coordinada: 1, no_realizada: 1, realizada: 1, entregada: 1,
  seguimiento: 1, clase_gratuita: 1, comprador: 1, captada: 1, descartado: 1,
}

/** Las etapas de las dos listas (abiertos y cerrados) de la vista: lo que el filtro acepta. */
function etapasDeLaVista(tipo: TipoVista, totales: Record<EtapaCRM, number>): EtapaCRM[] {
  return [...etapasDeVista(tipo, 'abiertos', totales), ...etapasDeVista(tipo, 'cerrados', totales)].flatMap((g) => g.etapas)
}

function contarTodas(filas: FilaCartera[]): Record<EtapaCRM, number> {
  const c = { ...TODAS }
  for (const k of Object.keys(c) as EtapaCRM[]) c[k] = 0
  for (const f of filas) c[f.etapa] += 1
  return c
}

export function tipoDeRol(rol: string): TipoVista {
  return rol === 'coordinador' ? 'coordinacion' : rol === 'asesor' ? 'asesor' : 'dueno'
}

// ── La lista de grupos (con su propia paginación) ────────────────────────────────────────

function ListaDeGrupos({
  grupos,
  tipo,
  filtros,
  aplicar,
  volver,
  ahora,
  total,
  truncado,
  seleccionable,
  alEliminar,
}: {
  grupos: Grupo[]
  tipo: TipoVista
  filtros: FiltrosCartera
  aplicar: (p: Partial<FiltrosCartera>) => void
  volver: string
  ahora: Date
  total: number
  truncado: boolean
  seleccionable: boolean
  alEliminar?: (ids: string[]) => Promise<void>
}) {
  // Cuántas filas muestra cada grupo. Se reinicia solo: quien la usa le cambia la `key`
  // cuando cambian los filtros o llegan datos nuevos.
  const [cuantos, setCuantos] = useState<Record<string, number>>({})
  const [seleccionando, setSeleccionando] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set())
  const [borrando, setBorrando] = useState(false)
  const visibles = (clave: string) => cuantos[clave] ?? DE_A
  const mostrados = grupos.reduce((s, g) => s + Math.min(g.filas.length, visibles(g.clave)), 0)
  const unidad = filtros.seg === 'cerrados' ? 'cerrados' : 'abiertos'

  const alternar = (id: string) =>
    setMarcadas((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })

  return (
    <>
      {seleccionando && alEliminar && (
        <BulkActionsBar
          count={marcadas.size}
          onClear={() => setMarcadas(new Set())}
          noun="procesos"
          actions={[
            {
              label: 'Eliminar',
              icon: <Trash2 className="mr-1 h-4 w-4" />,
              variant: 'destructive',
              disabled: borrando,
              onClick: async () => {
                setBorrando(true)
                try {
                  await alEliminar([...marcadas])
                  setMarcadas(new Set())
                  setSeleccionando(false)
                } finally {
                  setBorrando(false)
                }
              },
            },
          ]}
        />
      )}
      {grupos.map((g) => {
        const meta = metaDeGrupo(g.clave, tipo)
        const esLaLista = g.clave === 'todos' && tipo === 'dueno'
        return (
          <GrupoCartera
            key={g.clave}
            clave={g.clave}
            meta={meta}
            filas={g.filas}
            visibles={visibles(g.clave)}
            alCargarMas={() => setCuantos((c) => ({ ...c, [g.clave]: visibles(g.clave) + DE_A }))}
            modo="cartera"
            conAsesor={tipo !== 'asesor'}
            cerrados={g.clave === 'cerrados'}
            volver={volver}
            ahora={ahora}
            seleccion={seleccionando && esLaLista ? { marcadas, alAlternar: alternar } : undefined}
            extra={
              esLaLista ? (
                <div className="flex flex-wrap items-center gap-2">
                  {seleccionable && (
                    <button
                      type="button"
                      onClick={() => {
                        setSeleccionando((s) => !s)
                        setMarcadas(new Set())
                      }}
                      className="inline-flex min-h-11 items-center rounded-md px-2.5 text-[13px] font-medium hover:bg-accent md:raton:min-h-8"
                    >
                      {seleccionando ? 'Cancelar selección' : 'Seleccionar'}
                    </button>
                  )}
                  <CampoSelect enLinea etiqueta="Ordenar por" valor={filtros.orden} opciones={ORDENES} alCambiar={(orden) => aplicar({ orden })} className="md:w-auto" />
                </div>
              ) : undefined
            }
          />
        )
      })}
      <PieCartera texto={textoPie(mostrados, total, unidad, truncado)} />
    </>
  )
}

// ── La pantalla, sin ganchos de Next: la dibuja la página y la sonda de render ───────────

export interface PropsVistaCartera {
  datos: DatosCartera | null
  estado: 'listo' | 'cargando' | 'error'
  rol: string
  filtros: FiltrosCartera
  aplicar: (p: Partial<FiltrosCartera>) => void
  opcionesVerComo: { id: string; etiqueta: string }[] | null
  avisos: string[]
  volver: string
  alElegirVer: (id: string) => void
  alReintentar: () => void
  alEliminar?: (ids: string[]) => Promise<void>
}

export function VistaCartera(p: PropsVistaCartera) {
  const { datos, filtros, aplicar } = p
  const refLista = useRef<HTMLDivElement>(null)
  const tipo: TipoVista = datos?.vista.tipo ?? tipoDeRol(p.rol)
  const persona = datos?.vista.mirando ? datos.vista.persona : null
  const esDuenoPropio = tipo === 'dueno' && !persona

  const cabecera = (
    <>
      <CabeceraCartera titulo="CRM" subtitulo={subtituloDe(tipo, persona ? { nombre: persona.nombre } : null)}>
        {p.opcionesVerComo && <SelectorVerComo rol={p.rol} opciones={p.opcionesVerComo} valor={filtros.ver} alElegir={p.alElegirVer} />}
      </CabeceraCartera>
      {persona && <AvisoVerComo nombre={persona.nombre} rol={persona.rol} alVolver={() => p.alElegirVer('')} />}
      {p.avisos.map((a) => (
        <AvisoSuave key={a} texto={a} />
      ))}
    </>
  )

  if (p.estado === 'cargando') {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        <CargandoCartera />
      </div>
    )
  }

  const config: ConfigFiltros = {
    lista: 'crm',
    etapas: etapasDeVista(tipo, filtros.seg, datos ? contarTodas(datos.filas) : TODAS).flatMap((g) => g.etapas),
    asesores: tipo === 'asesor' ? null : (datos?.asesores ?? []),
  }
  const etiquetasSeg: [string, string] = ['Abiertos', 'Cerrados']

  if (!datos || p.estado === 'error') {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
          <SegmentoAbiertos etiquetas={etiquetasSeg} numeros={null} valor={filtros.seg} alCambiar={(seg) => aplicar({ seg, etapa: '', trabado: '' })} nombreGrupo="Qué procesos ver" />
          <BarraEtapas grupos={[]} conteo={TODAS} elegida="" alTocar={() => {}} error />
        </div>
        <FiltrosLista config={config} filtros={filtros} aplicar={aplicar} />
        <ErrorCartera titulo="No se pudo cargar la lista de procesos" alReintentar={p.alReintentar} />
      </div>
    )
  }

  const ahora = new Date(datos.generadoEn)
  const conteo = contarPorEtapa(datos.filas, filtros, ahora)
  const abiertos = (Object.keys(conteo) as EtapaCRM[]).filter(estaAbierto).reduce((s, e) => s + conteo[e], 0)
  const cerrados = conteo.captada + conteo.descartado
  const filtradas = filtrarFilas(datos.filas, filtros, ahora)
  const vista: Vista = tipo === 'dueno' ? { tipo } : { tipo, personaId: datos.vista.persona?.id ?? '' }
  const grupos = agrupar(filtradas, vista, ahora).map((g) =>
    g.clave === 'todos' && tipo === 'dueno' ? { ...g, filas: ordenarFilas(g.filas, filtros.orden) } : g,
  )
  const trabado = esDuenoPropio && filtros.seg === 'abiertos' ? calcularTrabado(datos.filas, ahora) : null
  const colegas = filtrarFilas(datos.filas, { ...filtros, colegas: '1' }, ahora).filter((f) => f.colega).length
  const fuentesOk = datos.fuentes.ultimoContacto === 'ok' && datos.fuentes.tareas === 'ok'
  const nadaUrgente =
    tipo === 'coordinacion' &&
    filtros.seg === 'abiertos' &&
    filtradas.length > 0 &&
    fuentesOk &&
    !grupos.some((g) => g.clave === 'sin-contacto' || g.clave === 'vencidas')
  const volverA = p.volver
  // La clave reinicia la paginación y la selección cuando cambia lo que se mira.
  const claveLista = `${datos.generadoEn}|${JSON.stringify({ ...filtros, ver: '' })}`

  let lista: React.ReactNode
  if (filtradas.length === 0) {
    if (hayFiltros(filtros)) {
      lista = <VacioConFiltros titulo="Ningún proceso coincide con estos filtros" alLimpiar={() => aplicar({ etapa: '', origen: '', asesor: '', entro: '', desde: '', hasta: '', q: '', trabado: '' })} />
    } else if (filtros.seg === 'cerrados') {
      lista = <VacioSinNada titulo="No hay procesos cerrados" texto="Cuando se capte o se descarte uno, aparece acá." />
    } else if (tipo === 'asesor' && !persona) {
      lista = <VacioSinNada titulo="Todavía no tenés procesos" texto="Cuando te asignen una tasación, aparece acá con su próximo paso." />
    } else {
      lista = <VacioSinNada titulo="No hay procesos abiertos" texto="Cuando entre uno nuevo, aparece acá." />
    }
  } else {
    lista = (
      <ListaDeGrupos
        key={claveLista}
        grupos={grupos}
        tipo={tipo}
        filtros={filtros}
        aplicar={aplicar}
        volver={volverA}
        ahora={ahora}
        total={filtradas.length}
        truncado={datos.truncado}
        seleccionable={esDuenoPropio && filtros.seg === 'abiertos' && !!p.alEliminar}
        alEliminar={p.alEliminar}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {cabecera}
      {trabado && (
        <LoTrabado
          trabado={trabado}
          ahora={ahora}
          activo={filtros.trabado}
          volver={volverA}
          alReintentar={p.alReintentar}
          alFiltrar={(k) => {
            const quitar = filtros.trabado === k
            aplicar({ trabado: quitar ? '' : k, seg: 'abiertos' })
            if (!quitar) refLista.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          }}
        />
      )}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
        <SegmentoAbiertos
          etiquetas={etiquetasSeg}
          numeros={[abiertos, cerrados]}
          valor={filtros.seg}
          alCambiar={(seg) => aplicar({ seg, etapa: '', trabado: '' })}
          nombreGrupo="Qué procesos ver"
        />
        <BarraEtapas
          grupos={etapasDeVista(tipo, filtros.seg, contarTodas(datos.filas))}
          conteo={conteo}
          elegida={filtros.etapa}
          alTocar={(e) => aplicar({ etapa: filtros.etapa === e ? '' : e })}
        />
      </div>
      <FiltrosLista config={config} filtros={filtros} aplicar={aplicar} />
      <div ref={refLista} className="flex scroll-mt-4 flex-col gap-4">
        {datos.fuentes.ultimoContacto === 'error' && <AvisoFuente texto={TEXTO_ERROR_ULTIMO} alReintentar={p.alReintentar} />}
        {datos.fuentes.tareas === 'error' && <AvisoFuente texto={TEXTO_ERROR_TAREAS} alReintentar={p.alReintentar} />}
        {datos.truncado && <AvisoSuave texto={TEXTO_TOPE} />}
        {colegas > 0 && (
          <div className="flex items-center gap-2 text-[13px]" data-colegas>
            <span className="text-texto-suave">Colegas</span>
            <button
              type="button"
              aria-pressed={filtros.colegas === '1'}
              onClick={() => aplicar({ colegas: filtros.colegas === '1' ? '' : '1' })}
              className={cn('inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 font-medium hover:bg-accent md:raton:min-h-8')}
            >
              {filtros.colegas === '1' ? `Ocultar (${colegas})` : `Mostrar (${colegas})`}
            </button>
          </div>
        )}
        {nadaUrgente && <NadaUrgente />}
        {lista}
      </div>
    </div>
  )
}

// ── El contenedor: dirección, pedidos y "Ver como" ───────────────────────────────────────

export interface PropsCarteraCRM {
  /** Lo que armó el servidor, o null si falló (la pantalla muestra el error con "Reintentar"). */
  inicial: DatosCartera | null
  rol: string
  /** Las opciones de la vista PROPIA (se conservan mientras se mira a otra persona); null si no corresponde. */
  opcionesVerComo: { id: string; etiqueta: string }[] | null
  /** "Esa persona no tiene una vista del CRM." cuando la dirección traía a alguien inválido. */
  avisoInicial: string | null
}

export function CarteraCRM({ inicial, rol, opcionesVerComo, avisoInicial }: PropsCarteraCRM) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [datos, setDatos] = useState<DatosCartera | null>(inicial)
  const [estado, setEstado] = useState<'listo' | 'cargando' | 'error'>(inicial ? 'listo' : 'error')
  const [avisoVer, setAvisoVer] = useState<string | null>(avisoInicial)
  const propia = useRef<DatosCartera | null>(inicial && !inicial.vista.mirando ? inicial : null)
  const ultimaCarga = useRef(0)
  const pedidos = usePedidosVersionados()
  const esDueno = rol === 'admin' || rol === 'dueno'

  // Las listas que valen para la vista que se está mirando. Sin datos (falló la lectura) se
  // aceptan las etapas posibles del rol y el asesor que trae la dirección: los filtros
  // tienen que seguir puestos para el "Reintentar" (spec "Falla la lista").
  const tipo = datos?.vista.tipo ?? tipoDeRol(rol)
  // Antes del hook, en el mismo render: si fuera en un efecto, la primera lectura de la
  // dirección se haría con listas vacías y descartaría filtros válidos.
  fijarPermitidos({
    asesores: datos ? (datos.asesores ?? []).map((a) => a.id) : [searchParams.get('asesor') ?? ''].filter(Boolean),
    etapas: etapasDeLaVista(tipo, datos ? contarTodas(datos.filas) : TODAS),
    verComo: esDueno ? (opcionesVerComo ?? []).map((o) => o.id) : [],
  })
  const { filtros, aplicados, aplicar } = useFiltrosUrl({ defectos: DEFECTOS, normalizar: normalizarCartera, soloNavegador: true })

  // "No se aplicó …" de lo que la dirección traía y no vale. "Ver como" no se avisa así: a
  // un asesor con un enlace del dueño no se le dice nada (ve su vista), y al dueño se le
  // dice "Esa persona no tiene una vista del CRM." (`avisoInicial`).
  const [noAplicados] = useState(() =>
    leerFiltrosCartera(new URLSearchParams(searchParams.toString()), PERMITIDOS.actual)
      .rechazados.filter((r) => r !== 'Ver como')
      .filter((r, i, a) => a.indexOf(r) === i)
      .map(textoNoSeAplico),
  )

  // Para volver a pedirse a sí misma (400 → la vista propia) sin depender de su identidad.
  const cargarRef = useRef<(ver: string, silencioso?: boolean) => Promise<void>>(async () => {})
  const cargar = useCallback(
    async (ver: string, silencioso = false): Promise<void> => {
      const { gen, signal } = silencioso ? pedidos.actual() : pedidos.abrir()
      if (!silencioso) setEstado('cargando')
      try {
        const res = await fetch(`/api/crm/cartera${ver ? `?ver_como=${encodeURIComponent(ver)}` : ''}`, { signal, cache: 'no-store' })
        const r = await leerJson<DatosCartera>(res)
        if (!pedidos.vigente(gen)) return
        if (r.ok) {
          setDatos(r.data)
          setEstado('listo')
          ultimaCarga.current = Date.now()
          if (!r.data.vista.mirando) propia.current = r.data
          return
        }
        if (r.status === 400 && ver) {
          // La persona elegida no tiene vista: vuelve a la propia con el mensaje (spec).
          setAvisoVer(TEXTO_PERSONA_INVALIDA)
          aplicar({ ver: '' })
          if (propia.current) {
            setDatos(propia.current)
            setEstado('listo')
          } else await cargarRef.current('')
          return
        }
        if (!silencioso) setEstado('error')
      } catch (e) {
        if (signal.aborted || !pedidos.vigente(gen)) return
        console.error('[crm] no se pudo cargar la cartera', e)
        if (!silencioso) setEstado('error')
      }
    },
    [aplicar, pedidos],
  )

  // Volver a la pestaña después de 5 minutos refresca la lista sin el esqueleto (la que hay
  // sigue a la vista hasta que llega la nueva), para que no quede vieja todo el día.
  const refrescar = useRef<() => void>(() => {})
  const verVigente = datos?.vista.mirando ? (datos.vista.persona?.id ?? '') : ''
  useEffect(() => {
    cargarRef.current = cargar
    refrescar.current = () => void cargar(verVigente, true)
  }, [cargar, verVigente])
  useEffect(() => {
    ultimaCarga.current = Date.now()
    const alVolver = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaCarga.current > REFRESCO_MS) refrescar.current()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  const elegirVer = (id: string) => {
    setAvisoVer(null)
    // Cambiar de vista saca la etapa, el asesor y lo trabado, y vuelve a "Abiertos"; la
    // búsqueda y el origen quedan (spec "Cambiar de vista limpia algunos filtros").
    aplicar({ ver: id, etapa: '', asesor: '', trabado: '', seg: 'abiertos' })
    if (!id && propia.current) {
      pedidos.abrir()
      setDatos(propia.current)
      setEstado('listo')
      return
    }
    void cargar(id)
  }

  const eliminar = async (ids: string[]) => {
    if (ids.length === 0) return
    const confirmacion = window.prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE ${ids.length} proceso${ids.length !== 1 ? 's' : ''} comercial${ids.length !== 1 ? 'es' : ''}.\n\n` +
        `Esta acción no se puede deshacer. Las tasaciones, propiedades y contactos asociados quedan intactos — solo desaparece el proceso del CRM.\n\n` +
        `Para confirmar, escribí ELIMINAR:`,
    )
    if (confirmacion !== 'ELIMINAR') return
    const resultados = await Promise.allSettled(ids.map((id) => fetch(`/api/deals/${encodeURIComponent(id)}`, { method: 'DELETE' })))
    const fallidos = resultados.filter((r) => r.status === 'rejected' || !r.value.ok).length
    await cargar('', true)
    if (fallidos > 0) window.alert(`${fallidos} no se pudieron eliminar. Probablemente requieren permisos de admin/dueño.`)
  }

  const busqueda = searchParams.toString()
  return (
    <VistaCartera
      datos={datos}
      estado={estado}
      rol={rol}
      filtros={filtros}
      aplicar={(parche) => {
        aplicar(parche)
      }}
      opcionesVerComo={esDueno ? opcionesVerComo : null}
      avisos={[...(avisoVer ? [avisoVer] : []), ...noAplicados]}
      volver={busqueda ? `${pathname}?${busqueda}` : pathname}
      alElegirVer={elegirVer}
      alReintentar={() => void cargar(aplicados.ver)}
      alEliminar={esDueno ? eliminar : undefined}
    />
  )
}

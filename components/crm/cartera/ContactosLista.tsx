'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { filtrarFilas, ordenarFilas, type FilaComun, type FiltrosCartera } from '@/lib/crm/cartera'
import { FILTROS_DEFECTO, leerFiltrosCartera } from '@/lib/crm/cartera-url'
import { hayFiltros, ORDENES, SIN_FILTROS, textoPie } from '@/lib/crm/cartera-pantalla'
import type { FilaContacto } from '@/lib/crm/contactos-cartera'
import { leerJson } from '@/lib/crm/leer-json'
import type { DatosContactos } from '@/lib/supabase/cartera'
import { cn } from '@/lib/utils'
import { CampoSelect } from '../ui/CampoSelect'
import { ALTO_CONTROL_LISTA } from '../ui/medidas'
import { CabeceraCartera } from './CabeceraCartera'
import { AvisoFuente, AvisoSuave, CargandoCartera, ErrorCartera, VacioConFiltros, VacioSinNada } from './EstadosCartera'
import { FiltrosLista, type ConfigFiltros } from './FiltrosCartera'
import { GrupoCartera } from './GrupoCartera'
import { DE_A, PieCartera } from './PieCartera'
import { SegmentoAbiertos } from './SegmentoAbiertos'
import { SUBTITULO_CONTACTOS, TEXTO_ERROR_TAREAS, TEXTO_ERROR_ULTIMO, TEXTO_TOPE, textoNoSeAplico } from './textos'

// Contactos (spec "Contactos por rol" y "Segmentos y filtros de Contactos"): las personas
// con la MISMA fila que el CRM, "Proceso" en lugar de "Etapa" y el teléfono debajo del
// nombre. Mismo patrón que la cartera: los datos vienen armados del servidor y se filtran,
// ordenan y paginan en memoria; los filtros viven en la dirección.

type FiltrosUrlContactos = { [K in keyof FiltrosCartera]: FiltrosCartera[K] }
const DEFECTOS: FiltrosUrlContactos = { ...FILTROS_DEFECTO }

// Igual que en la cartera: la lista de asesores válidos vive en un objeto de módulo que lee
// `normalizarContactos` (identidad estable para el hook). Contactos no tiene etapa, lo
// trabado ni "Ver como": esas claves caen al defecto.
const PERMITIDOS: { actual: { asesores: string[]; etapas: []; verComo: [] } } = { actual: { asesores: [], etapas: [], verComo: [] } }
function fijarPermitidos(asesores: string[]) {
  PERMITIDOS.actual = { asesores, etapas: [], verComo: [] }
}
function normalizarContactos(f: FiltrosUrlContactos): FiltrosUrlContactos {
  return leerFiltrosCartera(new URLSearchParams(f), PERMITIDOS.actual).filtros
}

/**
 * La fila de una persona en la forma común de las listas: la etapa es la del proceso que
 * muestra (o ninguna), y "abierto" es "tiene un proceso abierto" (el segmento).
 */
export function filaComunDeContacto(c: FilaContacto): FilaComun {
  return { ...c, etapa: c.proceso?.etapa ?? null, abierto: c.conProcesoAbierto }
}

export interface PropsVistaContactos {
  datos: DatosContactos | null
  estado: 'listo' | 'cargando' | 'error'
  /** Asesor: solo sus contactos y sin columna ni filtro "Asesor". */
  propios: boolean
  filtros: FiltrosCartera
  aplicar: (p: Partial<FiltrosCartera>) => void
  avisos: string[]
  volver: string
  alReintentar: () => void
}

function NuevoContacto() {
  return (
    <Link
      href="/contacts/new"
      className={cn('inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 text-sm font-medium shadow-xs hover:bg-accent', ALTO_CONTROL_LISTA)}
    >
      <UserPlus aria-hidden className="size-4" />
      Nuevo contacto
    </Link>
  )
}

function ListaPersonas({
  filas,
  filtros,
  aplicar,
  conAsesor,
  volver,
  ahora,
  truncado,
}: {
  filas: FilaComun[]
  filtros: FiltrosCartera
  aplicar: (p: Partial<FiltrosCartera>) => void
  conAsesor: boolean
  volver: string
  ahora: Date
  truncado: boolean
}) {
  const [visibles, setVisibles] = useState(DE_A)
  const cerrados = filtros.seg === 'cerrados'
  return (
    <>
      <GrupoCartera
        clave="personas"
        meta={{ titulo: 'Personas', texto: cerrados ? 'Su proceso se cerró (captado o descartado) o nunca tuvo uno.' : null, numero: null, conTasacion: true }}
        filas={filas}
        visibles={visibles}
        alCargarMas={() => setVisibles((v) => v + DE_A)}
        modo="contactos"
        conAsesor={conAsesor}
        cerrados={cerrados}
        volver={volver}
        ahora={ahora}
        extra={<CampoSelect enLinea etiqueta="Ordenar por" valor={filtros.orden} opciones={ORDENES} alCambiar={(orden) => aplicar({ orden })} className="md:w-auto" />}
      />
      <PieCartera texto={textoPie(Math.min(visibles, filas.length), filas.length, 'personas', truncado)} />
    </>
  )
}

export function VistaContactos(p: PropsVistaContactos) {
  const { datos, filtros, aplicar } = p
  const cabecera = (
    <>
      <CabeceraCartera titulo="Contactos" subtitulo={p.propios ? SUBTITULO_CONTACTOS.asesor : SUBTITULO_CONTACTOS.equipo}>
        <NuevoContacto />
      </CabeceraCartera>
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

  const config: ConfigFiltros = { lista: 'contactos', etapas: [], asesores: p.propios ? null : (datos?.asesores ?? []) }
  const etiquetas: [string, string] = ['Con proceso abierto', 'Sin proceso abierto']

  if (!datos || p.estado === 'error') {
    // Nunca "no hay contactos" cuando no se pudo leer (lo cuidaba el test viejo, D9).
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        <SegmentoAbiertos etiquetas={etiquetas} numeros={null} valor={filtros.seg} alCambiar={(seg) => aplicar({ seg })} nombreGrupo="Qué contactos ver" />
        <FiltrosLista config={config} filtros={filtros} aplicar={aplicar} />
        <ErrorCartera titulo="No se pudo cargar la lista de contactos" alReintentar={p.alReintentar} />
      </div>
    )
  }

  const ahora = new Date(datos.generadoEn)
  const todas = datos.filas.map(filaComunDeContacto)
  // En Contactos no se esconde a nadie por "colega": es la lista de personas, no de procesos.
  const comunes = { ...filtros, colegas: '1' as const, etapa: '' as const, trabado: '' as const }
  const conAbierto = filtrarFilas(todas, { ...comunes, seg: 'abiertos' }, ahora).length
  const sinAbierto = filtrarFilas(todas, { ...comunes, seg: 'cerrados' }, ahora).length
  const filtradas = ordenarFilas(filtrarFilas(todas, comunes, ahora), filtros.orden)

  let lista: React.ReactNode
  if (filtradas.length === 0) {
    lista = hayFiltros(filtros) ? (
      <VacioConFiltros titulo="Ningún contacto coincide con estos filtros" alLimpiar={() => aplicar(SIN_FILTROS)} />
    ) : filtros.seg === 'cerrados' ? (
      <VacioSinNada titulo="No hay contactos sin proceso abierto" texto="Cuando un proceso se capte o se descarte, la persona aparece acá." />
    ) : (
      <VacioSinNada titulo={p.propios ? 'Todavía no tenés contactos' : 'No hay contactos con un proceso abierto'} texto="Cuando entre uno nuevo, aparece acá." />
    )
  } else {
    lista = (
      <ListaPersonas
        key={`${datos.generadoEn}|${JSON.stringify(filtros)}`}
        filas={filtradas}
        filtros={filtros}
        aplicar={aplicar}
        conAsesor={!p.propios}
        volver={p.volver}
        ahora={ahora}
        truncado={datos.truncado}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {cabecera}
      <SegmentoAbiertos etiquetas={etiquetas} numeros={[conAbierto, sinAbierto]} valor={filtros.seg} alCambiar={(seg) => aplicar({ seg })} nombreGrupo="Qué contactos ver" />
      <FiltrosLista config={config} filtros={filtros} aplicar={aplicar} />
      {datos.fuentes.ultimoContacto === 'error' && <AvisoFuente texto={TEXTO_ERROR_ULTIMO} alReintentar={p.alReintentar} />}
      {datos.fuentes.tareas === 'error' && <AvisoFuente texto={TEXTO_ERROR_TAREAS} alReintentar={p.alReintentar} />}
      {datos.truncado && <AvisoSuave texto={TEXTO_TOPE} />}
      {lista}
    </div>
  )
}

export function ContactosLista({ inicial, propios }: { inicial: DatosContactos | null; propios: boolean }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [datos, setDatos] = useState<DatosContactos | null>(inicial)
  const [estado, setEstado] = useState<'listo' | 'cargando' | 'error'>(inicial ? 'listo' : 'error')
  const pedidos = usePedidosVersionados()

  // Sin datos se acepta el asesor que trae la dirección: el filtro tiene que seguir puesto
  // para el "Reintentar".
  fijarPermitidos(datos ? (datos.asesores ?? []).map((a) => a.id) : [searchParams.get('asesor') ?? ''].filter(Boolean))
  const { filtros, aplicar } = useFiltrosUrl({ defectos: DEFECTOS, normalizar: normalizarContactos, soloNavegador: true })
  const [noAplicados] = useState(() =>
    leerFiltrosCartera(new URLSearchParams(searchParams.toString()), PERMITIDOS.actual)
      .rechazados.filter((r, i, a) => a.indexOf(r) === i)
      .map(textoNoSeAplico),
  )

  const reintentar = async () => {
    const { gen, signal } = pedidos.abrir()
    setEstado('cargando')
    try {
      const r = await leerJson<DatosContactos>(await fetch('/api/crm/contactos', { signal, cache: 'no-store' }))
      if (!pedidos.vigente(gen)) return
      if (r.ok) {
        setDatos(r.data)
        setEstado('listo')
      } else setEstado('error')
    } catch (e) {
      if (signal.aborted || !pedidos.vigente(gen)) return
      console.error('[contactos] no se pudo cargar la lista', e)
      setEstado('error')
    }
  }

  const busqueda = searchParams.toString()
  return (
    <VistaContactos
      datos={datos}
      estado={estado}
      propios={propios}
      filtros={filtros}
      aplicar={(parche) => {
        aplicar(parche)
      }}
      avisos={noAplicados}
      volver={busqueda ? `${pathname}?${busqueda}` : pathname}
      alReintentar={() => void reintentar()}
    />
  )
}

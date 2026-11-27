'use client'

import { useRef, useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useBorradorConEspera } from '@/components/filters/use-borrador-con-espera'
import type { FiltrosCartera } from '@/lib/crm/cartera'
import {
  cuantosFiltros,
  etiquetaRango,
  fichasActivas,
  NOMBRE_ORIGEN,
  PERIODOS,
  SACAR_FICHA,
  SIN_FILTROS,
} from '@/lib/crm/cartera-pantalla'
import { NOMBRE_ETAPA, type EtapaCRM } from '@/lib/crm/etapas'
import { cn } from '@/lib/utils'
import { CampoSelect } from '../ui/CampoSelect'
import { HojaCelular } from '../ui/HojaCelular'
import { ALTO_CONTROL_LISTA, LETRA_CAMPO_LISTA } from '../ui/medidas'
import { FichasFiltros } from './FichasFiltros'

// Buscador y filtros con nombre (maqueta `.cartera-filtros`, `#cartera-hoja-filtros`,
// `#cartera-hoja-fechas`; spec "Filtros con nombre y búsqueda" y "La cartera en el
// celular"). En la computadora, los filtros a la vista; en el celular, solo el buscador y
// el botón "Filtros" (con la cantidad puesta, sin contar la búsqueda) que abre la hoja.
// Cambiar un filtro lo aplica en el acto: no hay un "Aplicar" que olvidarse de tocar.

const MAX_BUSQUEDA = 100
const ELEGIR = 'elegir'
const normalizarBusqueda = (s: string) => s.trim().slice(0, MAX_BUSQUEDA)

export interface ConfigFiltros {
  lista: 'crm' | 'contactos'
  /** Etapas del filtro "Etapa" (solo en el CRM). */
  etapas: EtapaCRM[]
  /** null = sin filtro "Asesor" (vista del asesor). */
  asesores: { id: string; nombre: string; activo: boolean }[] | null
}

type Aplicar = (p: Partial<FiltrosCartera>) => void

function Buscador({ valor, aplicar }: { valor: string; aplicar: Aplicar }) {
  const b = useBorradorConEspera({ value: valor, onChange: (q) => aplicar({ q }), normalizar: normalizarBusqueda, esperaMs: 250 })
  return (
    <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
      <label htmlFor="cartera-buscar" className="text-xs font-medium text-texto-suave">
        Buscar
      </label>
      <span className="relative block">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-suave" />
        <input
          id="cartera-buscar"
          type="search"
          value={b.borrador}
          onChange={(e) => b.escribir(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') b.aplicarYa()
          }}
          placeholder="Nombre, teléfono o calle"
          autoComplete="off"
          maxLength={MAX_BUSQUEDA}
          className={cn(
            'w-full min-w-0 rounded-md border border-input bg-card pl-9 pr-3 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-brand',
            ALTO_CONTROL_LISTA,
            LETRA_CAMPO_LISTA,
          )}
        />
      </span>
    </div>
  )
}

function CamposFiltro({
  config,
  filtros,
  aplicar,
  alElegirFechas,
  refPrimero,
  className,
}: {
  config: ConfigFiltros
  filtros: FiltrosCartera
  aplicar: Aplicar
  alElegirFechas: () => void
  refPrimero?: React.Ref<HTMLSelectElement>
  className?: string
}) {
  const cerrados = filtros.seg === 'cerrados'
  const periodos: { valor: string; etiqueta: string }[] = [
    ...PERIODOS,
    ...(filtros.entro === 'rango' ? [{ valor: 'rango', etiqueta: etiquetaRango(filtros.desde, filtros.hasta) }] : []),
    { valor: ELEGIR, etiqueta: 'Elegir fechas…' },
  ]
  const campo = 'md:w-auto md:max-w-60 md:flex-1 md:basis-36'
  return (
    <>
      {config.lista === 'crm' && (
        <CampoSelect
          etiqueta="Etapa"
          valor={filtros.etapa}
          refSelect={refPrimero}
          opciones={[
            { valor: '' as const, etiqueta: cerrados ? 'Todos los cerrados' : 'Todas las etapas' },
            ...config.etapas.map((e) => ({ valor: e, etiqueta: NOMBRE_ETAPA[e] })),
          ]}
          alCambiar={(etapa) => aplicar({ etapa })}
          className={cn(campo, className)}
        />
      )}
      <CampoSelect
        etiqueta="Origen"
        valor={filtros.origen}
        refSelect={config.lista === 'crm' ? undefined : refPrimero}
        opciones={[
          { valor: '' as const, etiqueta: 'Todos los orígenes' },
          { valor: 'embudo' as const, etiqueta: NOMBRE_ORIGEN.embudo },
          { valor: 'referido' as const, etiqueta: NOMBRE_ORIGEN.referido },
          { valor: 'historico' as const, etiqueta: NOMBRE_ORIGEN.historico },
        ]}
        alCambiar={(origen) => aplicar({ origen })}
        className={cn(campo, className)}
      />
      {config.asesores && (
        <CampoSelect
          etiqueta="Asesor"
          valor={filtros.asesor}
          opciones={[
            { valor: '', etiqueta: 'Todos los asesores' },
            ...config.asesores.map((a) => ({ valor: a.id, etiqueta: a.activo ? a.nombre : `${a.nombre} (dado de baja)` })),
            { valor: 'sin', etiqueta: 'Sin asesor' },
          ]}
          alCambiar={(asesor) => aplicar({ asesor })}
          className={cn(campo, className)}
        />
      )}
      <CampoSelect
        etiqueta={config.lista === 'crm' ? 'Entró al CRM' : 'Se registró'}
        valor={filtros.entro}
        opciones={periodos}
        alCambiar={(v) => {
          if (v === ELEGIR) alElegirFechas()
          else if (v !== 'rango') {
            const entro = PERIODOS.find((p) => p.valor === v)?.valor ?? ''
            aplicar({ entro, desde: '', hasta: '' })
          }
        }}
        className={cn(campo, className)}
      />
    </>
  )
}

export function HojaFechas({
  abierta,
  onAbierta,
  desde,
  hasta,
  alAplicar,
  alCerrar,
}: {
  abierta: boolean
  onAbierta: (a: boolean) => void
  desde: string
  hasta: string
  alAplicar: (desde: string, hasta: string) => void
  alCerrar?: () => void
}) {
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  const [error, setError] = useState<string | null>(null)
  const refDesde = useRef<HTMLInputElement>(null)
  const entrada = cn('w-full min-w-0 rounded-md border border-input bg-card px-3 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-brand', ALTO_CONTROL_LISTA, LETRA_CAMPO_LISTA)
  return (
    <HojaCelular
      abierta={abierta}
      onAbierta={(a) => {
        if (a) {
          setD(desde)
          setH(hasta)
        }
        setError(null)
        onAbierta(a)
      }}
      titulo="Elegir fechas"
      descripcion="Desde y hasta qué día filtrar."
      alAbrir={() => refDesde.current?.focus()}
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" onClick={() => onAbierta(false)} className={cn('rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-accent', ALTO_CONTROL_LISTA)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!d && !h) return setError('Elegí al menos una fecha')
              if (d && h && d > h) return setError('La primera fecha tiene que ser anterior a la segunda.')
              alAplicar(d, h)
              onAbierta(false)
            }}
            className={cn('rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90', ALTO_CONTROL_LISTA)}
          >
            Aplicar
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="cartera-desde" className="text-xs font-medium text-texto-suave">
          Desde
        </label>
        <input id="cartera-desde" ref={refDesde} type="date" value={d} onChange={(e) => setD(e.target.value)} className={entrada} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="cartera-hasta" className="text-xs font-medium text-texto-suave">
          Hasta
        </label>
        <input id="cartera-hasta" type="date" value={h} onChange={(e) => setH(e.target.value)} className={entrada} />
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-destructive-texto">
          {error}
        </p>
      )}
    </HojaCelular>
  )
}

export function HojaFiltros({
  abierta,
  onAbierta,
  config,
  filtros,
  aplicar,
  alElegirFechas,
  alCerrar,
}: {
  abierta: boolean
  onAbierta: (a: boolean) => void
  config: ConfigFiltros
  filtros: FiltrosCartera
  aplicar: Aplicar
  alElegirFechas: () => void
  alCerrar?: () => void
}) {
  const refPrimero = useRef<HTMLSelectElement>(null)
  return (
    <HojaCelular
      abierta={abierta}
      onAbierta={onAbierta}
      titulo="Filtros"
      descripcion="Filtrar la lista."
      alAbrir={() => refPrimero.current?.focus()}
      alCerrar={alCerrar}
      pie={
        <>
          <button
            type="button"
            onClick={() => aplicar({ ...SIN_FILTROS, q: filtros.q })}
            className={cn('rounded-md px-4 text-sm font-medium text-texto-suave hover:bg-accent hover:text-foreground', ALTO_CONTROL_LISTA)}
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            onClick={() => onAbierta(false)}
            className={cn('rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90', ALTO_CONTROL_LISTA)}
          >
            Ver resultados
          </button>
        </>
      }
    >
      <CamposFiltro config={config} filtros={filtros} aplicar={aplicar} alElegirFechas={alElegirFechas} refPrimero={refPrimero} />
    </HojaCelular>
  )
}

export function FiltrosLista({ config, filtros, aplicar }: { config: ConfigFiltros; filtros: FiltrosCartera; aplicar: Aplicar }) {
  const [hojaFiltros, setHojaFiltros] = useState(false)
  const [hojaFechas, setHojaFechas] = useState(false)
  const refBoton = useRef<HTMLButtonElement>(null)
  // A dónde vuelve el foco al cerrar "Elegir fechas": el control que la abrió.
  const refVolverFechas = useRef<HTMLElement | null>(null)
  const n = cuantosFiltros(filtros)
  const abrirFechas = () => {
    refVolverFechas.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setHojaFechas(true)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Buscador valor={filtros.q} aplicar={aplicar} />
        <div className="hidden md:contents" data-filtros-escritorio>
          <CamposFiltro config={config} filtros={filtros} aplicar={aplicar} alElegirFechas={abrirFechas} />
        </div>
        <button
          ref={refBoton}
          type="button"
          onClick={() => setHojaFiltros(true)}
          className={cn('inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 text-sm font-medium shadow-xs hover:bg-accent md:hidden', ALTO_CONTROL_LISTA)}
          aria-label={n > 0 ? `Filtros (${n} puestos)` : 'Filtros'}
        >
          <SlidersHorizontal aria-hidden className="size-4" />
          Filtros
          {n > 0 && (
            <span aria-hidden className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold text-brand-foreground">
              {n}
            </span>
          )}
        </button>
      </div>
      <FichasFiltros
        fichas={fichasActivas(filtros, { asesores: config.asesores ?? [], lista: config.lista })}
        alSacar={(clave) => aplicar(SACAR_FICHA[clave])}
        alLimpiar={() => aplicar(SIN_FILTROS)}
      />
      <HojaFiltros
        abierta={hojaFiltros}
        onAbierta={setHojaFiltros}
        config={config}
        filtros={filtros}
        aplicar={aplicar}
        alElegirFechas={abrirFechas}
        alCerrar={() => refBoton.current?.focus()}
      />
      <HojaFechas
        abierta={hojaFechas}
        onAbierta={setHojaFechas}
        desde={filtros.desde}
        hasta={filtros.hasta}
        alAplicar={(desde, hasta) => aplicar({ entro: 'rango', desde, hasta })}
        alCerrar={() => {
          const v = refVolverFechas.current
          if (v && v.isConnected) v.focus()
          else refBoton.current?.focus()
        }}
      />
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowRight, Briefcase, CalendarCheck, ChevronRight, Clock, Eye, MapPin, MessageCircle, Pencil, Phone, RefreshCw, TriangleAlert } from 'lucide-react'
import { UnidentifiedBanner } from '@/components/inbox/UnidentifiedBanner'
import { completarTarea, EVENTO_CAMBIO, reabrirTareaPedida } from '@/components/tareas/acciones'
import { ICONO_TIPO } from '@/components/tareas/NuevaTarea'
import { leerJson } from '@/lib/crm/leer-json'
import type { ItemLeadSinContacto, ItemParaLlamar, ItemProcesoQueEspera, ItemSinRespuesta, ItemTasacion, TiempoMedio } from '@/lib/crm/inicio'
import type { TareaDeAgenda } from '@/lib/supabase/agenda-tareas'
import type { Bloque, Numeros, RespuestaInicio, TareasDelDia, VisitaDeHoy } from '@/lib/supabase/inicio'
import { cn } from '@/lib/utils'

// El Inicio por rol (crm-inicio, D5; maqueta pantallas/inicio.*). Un pedido a /api/inicio;
// cada bloque trae su propio ok/error. Dos columnas (principal y lateral) desde 1024 px; en el
// celular, una sola en el MISMO orden del DOM: primero lo principal, después lo lateral. Sin
// `order` de CSS, para que el lector de pantalla y el teclado sigan el orden que se ve.

const BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60'
const ALTO = 'h-11 raton:h-9'

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}
const telVisible = (t: string) => (t.length === 10 ? `${t.slice(0, 2)} ${t.slice(2, 6)}-${t.slice(6)}` : t)
const telHref = (t: string) => `tel:+549${t.replace(/\D/g, '').slice(-10)}`

function Tarjeta({
  titulo,
  numero,
  marca,
  soloLectura,
  extra,
  children,
  pie,
  ...resto
}: {
  titulo: string
  numero?: number | null
  marca?: boolean
  soloLectura?: boolean
  extra?: React.ReactNode
  children: React.ReactNode
  pie?: React.ReactNode
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...resto}
      className={cn('flex min-w-0 flex-col rounded-xl border bg-card', marca ? 'border-brand/40' : 'border-border')}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold">{titulo}</h2>
        {extra}
        {soloLectura && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-texto-suave">
            <Eye aria-hidden className="size-3.5" /> Solo lectura
          </span>
        )}
        {numero ? (
          <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold', marca ? 'bg-brand text-brand-foreground' : 'bg-muted')}>
            {numero}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col px-4 pb-4">{children}</div>
      {pie}
    </section>
  )
}

function ErrorBloque({ onReintentar }: { onReintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
      <TriangleAlert aria-hidden className="size-5 text-destructive-texto" />
      <p className="text-sm font-semibold">No se pudo cargar</p>
      <p className="text-xs text-texto-suave">El resto de la pantalla sigue funcionando.</p>
      <button type="button" onClick={onReintentar} className={cn(BOTON, ALTO, 'border border-border bg-card px-3 hover:bg-accent')}>
        <RefreshCw aria-hidden className="size-4" /> Reintentar
      </button>
    </div>
  )
}

function Vacio({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-6 text-center">
      <p className="text-sm font-semibold">{titulo}</p>
      {texto && <p className="text-sm text-texto-suave">{texto}</p>}
    </div>
  )
}

function Avatar({ nombre }: { nombre: string }) {
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
      {iniciales(nombre)}
    </span>
  )
}

function enlaceFicha(p: { contactoId: string | null; procesoId: string }, registrar = false): string {
  return p.contactoId ? `/contacts/${p.contactoId}${registrar ? '?registrar=1' : ''}` : `/pipeline/${p.procesoId}`
}

function Acciones({ p, lectura }: { p: { contactoId: string | null; procesoId: string; nombre: string; telefono: string | null }; lectura: boolean }) {
  if (lectura) {
    return p.telefono ? (
      <p className="flex items-center gap-1.5 text-xs text-texto-suave">
        <Phone aria-hidden className="size-3.5" /> {telVisible(p.telefono)}
      </p>
    ) : null
  }
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {p.telefono && (
        <a href={telHref(p.telefono)} aria-label={`Llamar a ${p.nombre} al ${telVisible(p.telefono)}`} className={cn(BOTON, ALTO, 'bg-brand px-4 text-brand-foreground hover:bg-brand/90 max-sm:flex-1')}>
          <Phone aria-hidden className="size-4" /> {telVisible(p.telefono)}
        </a>
      )}
      {/* Sin contacto no hay ficha donde registrar: no se ofrece (revisión de código 10). */}
      {p.contactoId && (
        <Link href={enlaceFicha(p, true)} aria-label={`Registrar la llamada a ${p.nombre}`} className={cn(BOTON, ALTO, 'border border-border bg-card px-4 hover:bg-accent max-sm:flex-1')}>
          <Pencil aria-hidden className="size-4" /> Registrar
        </Link>
      )}
    </div>
  )
}

function FilaPersona({ p, children, lectura }: { p: ItemParaLlamar | ItemSinRespuesta | ItemLeadSinContacto; children: React.ReactNode; lectura: boolean }) {
  return (
    <li className="flex gap-3 py-3">
      <Avatar nombre={p.nombre} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {children}
        <Acciones p={p} lectura={lectura} />
      </div>
    </li>
  )
}

function ParaLlamar({ items, lectura }: { items: ItemParaLlamar[]; lectura: boolean }) {
  if (items.length === 0) return <Vacio titulo="Nadie para llamar ahora" texto="Cuando entre una solicitud o venza una llamada, aparece acá." />
  return (
    <ul className="flex flex-col divide-y divide-border" data-bloque-lista="para-llamar">
      {items.map((x) => (
        <FilaPersona key={x.procesoId} p={x} lectura={lectura}>
          <p className="flex flex-wrap items-center gap-2">
            <Link href={enlaceFicha(x)} className="font-semibold hover:underline">{x.nombre}</Link>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
              <Phone aria-hidden className="size-3" /> {x.llamada}
            </span>
          </p>
          <p className="text-[13px] text-texto-suave">
            {x.registrado}
            {x.propiedad ? ` · ${x.propiedad}` : ''}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
            <span className={cn('inline-flex items-center gap-1 font-semibold', x.estado.tipo === 'proxima' ? 'text-texto-suave' : 'text-destructive-texto')}>
              {x.estado.tipo === 'espera' ? <Clock aria-hidden className="size-3.5" /> : <TriangleAlert aria-hidden className="size-3.5" />}
              {x.estado.texto}
            </span>
            {x.anterior && <span className="text-texto-suave">· {x.anterior}</span>}
          </p>
        </FilaPersona>
      ))}
    </ul>
  )
}

const AYUDA_SIN_RESPUESTA = 'Ya se los llamó y se les escribió. No tienen tarea: hay que decidir si se insiste o se cierra.'
const AYUDA_SIN_PROXIMO = 'Ya se los contactó, pero no tienen ninguna tarea pendiente. Hay que decidir el próximo paso.'

function SinRespuesta({ items, lectura, ayuda = AYUDA_SIN_RESPUESTA, Icono = MessageCircle }: { items: ItemSinRespuesta[]; lectura: boolean; ayuda?: string; Icono?: typeof Clock }) {
  return (
    <>
      <p className="pb-1 text-[13px] text-texto-suave">{ayuda}</p>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((x) => (
          <FilaPersona key={x.procesoId} p={x} lectura={lectura}>
            <Link href={enlaceFicha(x)} className="font-semibold hover:underline">{x.nombre}</Link>
            <p className="flex items-center gap-1.5 text-[13px] text-texto-suave">
              <Icono aria-hidden className="size-3.5" /> {x.linea}
            </p>
            <p className="text-[13px] text-texto-suave">
              {x.registrado}
              {x.propiedad ? ` · ${x.propiedad}` : ''}
            </p>
          </FilaPersona>
        ))}
      </ul>
    </>
  )
}

function FilaTarea({ t, lectura, hecha, onCompletar }: { t: TareaDeAgenda; lectura: boolean; hecha: boolean; onCompletar: () => void }) {
  const Icono = ICONO_TIPO[t.tipo]
  return (
    <li className={cn('flex items-start gap-3 py-2.5', hecha && 'opacity-50')}>
      {!lectura && (
        <button
          type="button"
          role="checkbox"
          aria-checked={hecha}
          aria-label={`Completar: ${t.title}`}
          disabled={hecha}
          onClick={onCompletar}
          className="-m-2.5 flex size-11 shrink-0 items-center justify-center rounded-full raton:-m-1 raton:size-7"
        >
          <span aria-hidden className="size-5 rounded-full border-2 border-border bg-card" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-start gap-1.5 text-sm font-medium leading-snug">
          <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-texto-suave" />
          <Link href={t.enlace} className={cn('min-w-0 [overflow-wrap:anywhere] hover:underline', hecha && 'line-through')}>{t.title}</Link>
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 pl-5.5 text-xs text-texto-suave">
          <span className={cn(t.vencimiento.estado === 'vencida' && 'text-destructive-texto', t.vencimiento.estado === 'hoy' && 'text-brand')}>{t.vencimiento.texto}</span>
          {t.contacto && (
            <Link href={`/contacts/${t.contacto.id}`} className="underline decoration-dotted underline-offset-2">{t.contacto.nombre}</Link>
          )}
          {lectura && t.asignado && <span>{t.asignado.nombre}</span>}
        </p>
      </div>
    </li>
  )
}

function Tareas({ datos, lectura, onCambio, siempre }: { datos: TareasDelDia; lectura: boolean; onCambio: () => void; siempre: boolean }) {
  const [hechas, setHechas] = useState<Set<string>>(new Set())
  const completar = async (t: TareaDeAgenda) => {
    setHechas((h) => new Set(h).add(t.id))
    const r = await completarTarea(t.id)
    if (!r.ok) {
      setHechas((h) => {
        const n = new Set(h)
        n.delete(t.id)
        return n
      })
      toast.error(r.error)
      return
    }
    toast('Tarea completada', {
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const d = await reabrirTareaPedida(t.id)
          if (d.ok) {
            // Sin esto, la tarea reabierta volvía tachada y sin poder tildarse (revisión de código 4).
            setHechas((h) => {
              const n = new Set(h)
              n.delete(t.id)
              return n
            })
            toast('Listo, se deshizo.')
          } else toast.error(d.error)
          onCambio()
        },
      },
    })
  }
  if (datos.hoy.length === 0 && datos.manana.length === 0) {
    return siempre ? <Vacio titulo="Todo al día" texto="No queda nada vencido ni para hoy." /> : <Vacio titulo="Nada para hoy" />
  }
  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {datos.hoy.map((t) => <FilaTarea key={t.id} t={t} lectura={lectura} hecha={hechas.has(t.id)} onCompletar={() => void completar(t)} />)}
      </ul>
      {datos.hoy.length === 0 && siempre && <Vacio titulo="Todo al día" texto="No queda nada vencido ni para hoy." />}
      {datos.manana.length > 0 && (
        <>
          <p className="eyebrow mt-3 border-t border-border pt-3">Para mañana · {datos.manana.length}</p>
          <ul className="flex flex-col divide-y divide-border">
            {datos.manana.map((t) => <FilaTarea key={t.id} t={t} lectura={lectura} hecha={hechas.has(t.id)} onCompletar={() => void completar(t)} />)}
          </ul>
        </>
      )}
    </>
  )
}

const pieTareas = (manana: number) => (
  <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
    <span className="text-texto-suave">{manana > 0 ? 'Hoy y mañana' : 'Nada cargado para mañana'}</span>
    <Link href="/tasks" className="inline-flex items-center gap-1 text-brand underline underline-offset-2">
      Ver todos los pendientes <ArrowRight aria-hidden className="size-4" />
    </Link>
  </div>
)

function Tasaciones({ items }: { items: ItemTasacion[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((x) => (
        <li key={x.procesoId} className="flex items-center gap-3">
          <span className="flex min-w-16 flex-col items-center rounded-md bg-brand-soft px-2 py-1.5 text-brand">
            <span className="text-sm font-semibold">{x.hora ?? 'Todo el día'}</span>
            <span className="text-xs">{x.dia}</span>
          </span>
          <div className="flex min-w-0 flex-col text-sm">
            <span className="flex items-center gap-1.5 font-medium"><MapPin aria-hidden className="size-4 text-texto-suave" /> {x.direccion ?? 'Sin dirección'}</span>
            <span className="text-xs text-texto-suave">
              <Link href={enlaceFicha(x)} className="underline decoration-dotted underline-offset-2">{x.nombre}</Link>
              {x.asesor ? ` con ${x.asesor}` : ''}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function NumerosDelDia({ n }: { n: Numeros }) {
  const item = (t: string, v: number) => (
    <div className="flex flex-col rounded-md bg-muted px-3 py-2">
      <dt className="text-xs text-texto-suave">{t}</dt>
      <dd className="text-2xl font-semibold">{v}</dd>
    </div>
  )
  return (
    <dl className="grid grid-cols-3 gap-2">
      {item('Solicitudes nuevas', n.solicitudes)}
      {item('Llamadas hechas', n.llamadas)}
      {item('Agendadas', n.agendadas)}
    </dl>
  )
}

function LeadsSinContacto({ items }: { items: ItemLeadSinContacto[] }) {
  if (items.length === 0) return <Vacio titulo="Todos los leads tienen su primera llamada" texto="Si entra una solicitud y nadie la llama, aparece acá con el tiempo que lleva esperando." />
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((x) => (
        <FilaPersona key={x.procesoId} p={x} lectura>
          <Link href={enlaceFicha(x)} className="font-semibold hover:underline">{x.nombre}</Link>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-destructive-texto">
            <Clock aria-hidden className="size-3.5" /> {x.espera}
          </p>
          <p className="text-[13px] text-texto-suave">{x.registrado}{x.propiedad ? ` · ${x.propiedad}` : ''}</p>
        </FilaPersona>
      ))}
    </ul>
  )
}

function Tiempo({ t }: { t: TiempoMedio }) {
  if (t.n === 0) return <Vacio titulo="Todavía sin datos esta semana" texto="Aparece cuando algún lead registrado desde el lunes reciba su primera llamada." />
  const caja = (valor: string, Icono: typeof Clock, texto: string) => (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <span className="text-xl font-semibold">{valor}</span>
      <span className="flex items-center gap-1 text-xs"><Icono aria-hidden className="size-3.5" /> {texto}</span>
      <span className="text-xs text-texto-suave">{t.n} {t.n === 1 ? 'lead' : 'leads'}</span>
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {caja(t.habiles!, Briefcase, 'horas hábiles')}
        {caja(t.reloj!, Clock, 'horas de reloj')}
      </div>
      {t.pocos && (
        <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-[13px]">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span><strong>Pocos casos.</strong> Con menos de 20 leads, una sola llamada mueve mucho el promedio.</span>
        </p>
      )}
      <p className="text-xs text-texto-suave">
        Leads registrados desde el lunes que ya recibieron su primera llamada. Hábiles: lunes a viernes de 9 a 18.
        {t.sinLlamar > 0 ? ` ${t.sinLlamar === 1 ? 'Otro 1 todavía sin llamar no entra' : `Otros ${t.sinLlamar} todavía sin llamar no entran`} en el promedio.` : ''}
      </p>
    </div>
  )
}

function Procesos({ items }: { items: ItemProcesoQueEspera[] }) {
  if (items.length === 0) return <Vacio titulo="Nada esperando por vos" />
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((x) => (
        <li key={x.procesoId} className="flex items-center gap-3 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {x.nombre}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{x.etapa}</span>
            </p>
            {x.propiedad && <p className="text-[13px] text-texto-suave">{x.propiedad}</p>}
            <p className="flex items-start gap-1.5 text-[13px]"><Clock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" /> {x.texto}</p>
          </div>
          <Link href={enlaceFicha(x)} aria-label={`Abrir la ficha de ${x.nombre}`} className={cn(BOTON, 'size-11 shrink-0 border border-border bg-card hover:bg-accent raton:size-9')}>
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Visitas({ items }: { items: VisitaDeHoy[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((v) => (
        <li key={v.id} className="flex items-start gap-2.5 py-2.5 text-sm">
          {v.id.startsWith('tasacion:') ? <CalendarCheck aria-hidden className="mt-0.5 size-4 text-texto-suave" /> : <MapPin aria-hidden className="mt-0.5 size-4 text-texto-suave" />}
          <div className="flex flex-col">
            <Link href={v.enlace} className="font-medium hover:underline">
              {v.id.startsWith('tasacion:') ? 'Tasación' : 'Visita'}
              {v.cliente ? ` con ${v.cliente}` : ''}
              {v.direccion ? ` · ${v.direccion}` : ''}
            </Link>
            <span className="flex items-center gap-1 text-xs text-brand"><Clock aria-hidden className="size-3" /> Hoy {v.hora}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Dibuja un bloque: error con "Reintentar", o su contenido. */
function ConBloque<T>({ b, onReintentar, children }: { b: Bloque<unknown> | undefined; onReintentar: () => void; children: (d: T) => React.ReactNode }) {
  if (!b) return null
  if (!b.ok) return <ErrorBloque onReintentar={onReintentar} />
  return <>{children(b.datos as T)}</>
}
const cantidad = (b: Bloque<unknown> | undefined, f: (d: never) => number): number | null => (b && b.ok ? f(b.datos as never) : null)

export function Inicio({ rolUsuario }: { rolUsuario: string }) {
  const [r, setR] = useState<RespuestaInicio | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando')
  const version = useRef(0)

  const cargar = useCallback(async () => {
    const v = ++version.current
    try {
      const x = await leerJson<RespuestaInicio>(await fetch('/api/inicio', { cache: 'no-store' }))
      if (v !== version.current) return
      if (x.ok) {
        setR(x.data)
        setEstado('ok')
      } else setEstado('error')
    } catch (err) {
      console.error('[inicio] no se pudo cargar', err)
      if (v === version.current) setEstado('error')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- suscripción a la red: el estado cambia después del pedido
    void cargar()
    const alCambiar = () => void cargar()
    window.addEventListener(EVENTO_CAMBIO, alCambiar)
    return () => window.removeEventListener(EVENTO_CAMBIO, alCambiar)
  }, [cargar])

  const puedeConectarAvisos = ['admin', 'dueno', 'coordinador'].includes(rolUsuario)
  const recargar = useCallback(() => {
    void cargar()
  }, [cargar])

  if (!r) {
    return (
      <div className="flex flex-col gap-4">
        {puedeConectarAvisos && <UnidentifiedBanner />}
        {estado === 'error' ? (
          <div className="rounded-xl border border-border bg-card"><ErrorBloque onReintentar={recargar} /></div>
        ) : (
          <p className="text-sm text-texto-suave">Cargando…</p>
        )}
      </div>
    )
  }

  const b = r.bloques
  const lectura = r.rol === 'dueno'
  const tareasN = cantidad(b.tareas, (d: TareasDelDia) => d.hoy.length)
  const tareasPie = b.tareas?.ok ? pieTareas((b.tareas.datos as TareasDelDia).manana.length) : undefined
  const vacio = (x: Bloque<unknown> | undefined) => !!x?.ok && (x.datos as unknown[]).length === 0
  // "Tareas de hoy" de la coordinación y del dueño se esconde si no hay nada (ni hoy ni mañana):
  // lo de la cola ya está arriba. El asesor la ve siempre, con "Todo al día".
  const tareasVacias = !!b.tareas?.ok && (b.tareas.datos as TareasDelDia).hoy.length === 0 && (b.tareas.datos as TareasDelDia).manana.length === 0

  const paraLlamar = (
    <Tarjeta titulo="Para llamar ahora" marca={!lectura} soloLectura={lectura} numero={cantidad(b.paraLlamar, (d: ItemParaLlamar[]) => d.length)} data-bloque="para-llamar">
      <ConBloque<ItemParaLlamar[]> b={b.paraLlamar} onReintentar={recargar}>{(d) => <ParaLlamar items={d} lectura={lectura} />}</ConBloque>
    </Tarjeta>
  )
  const sinRespuesta = !vacio(b.sinRespuesta) && (
    <Tarjeta titulo="Sin respuesta tras WhatsApp" soloLectura={lectura} numero={cantidad(b.sinRespuesta, (d: ItemSinRespuesta[]) => d.length)} data-bloque="sin-respuesta">
      <ConBloque<ItemSinRespuesta[]> b={b.sinRespuesta} onReintentar={recargar}>{(d) => <SinRespuesta items={d} lectura={lectura} />}</ConBloque>
    </Tarjeta>
  )
  const sinProximo = !vacio(b.sinProximo) && (
    <Tarjeta titulo="Sin próximo paso" soloLectura={lectura} numero={cantidad(b.sinProximo, (d: ItemSinRespuesta[]) => d.length)} data-bloque="sin-proximo">
      <ConBloque<ItemSinRespuesta[]> b={b.sinProximo} onReintentar={recargar}>{(d) => <SinRespuesta items={d} lectura={lectura} ayuda={AYUDA_SIN_PROXIMO} Icono={Clock} />}</ConBloque>
    </Tarjeta>
  )
  const tareasCoordinacion = !tareasVacias && (
    <Tarjeta titulo={lectura ? 'Tareas de hoy · coordinación' : 'Tareas de hoy'} soloLectura={lectura} numero={tareasN} pie={tareasPie} data-bloque="tareas">
      <ConBloque<TareasDelDia> b={b.tareas} onReintentar={recargar}>{(d) => <Tareas datos={d} lectura={lectura} onCambio={recargar} siempre={false} />}</ConBloque>
    </Tarjeta>
  )
  const tasaciones = !vacio(b.tasaciones) && (
    <Tarjeta titulo="Tasaciones · hoy y mañana" numero={cantidad(b.tasaciones, (d: ItemTasacion[]) => d.length)} data-bloque="tasaciones">
      <ConBloque<ItemTasacion[]> b={b.tasaciones} onReintentar={recargar}>{(d) => <Tasaciones items={d} />}</ConBloque>
    </Tarjeta>
  )
  const numeros = (
    <Tarjeta titulo={`Hoy, hasta las ${b.numeros?.ok ? (b.numeros.datos as Numeros).hasta : r.fecha.split(' · ')[1] ?? ''}`} data-bloque="numeros">
      <ConBloque<Numeros> b={b.numeros} onReintentar={recargar}>{(d) => <NumerosDelDia n={d} />}</ConBloque>
    </Tarjeta>
  )

  let principal: React.ReactNode
  let lateral: React.ReactNode
  if (r.rol === 'coordinacion') {
    principal = <>{paraLlamar}{sinRespuesta}{sinProximo}</>
    lateral = <>{tareasCoordinacion}{tasaciones}{numeros}</>
  } else if (r.rol === 'dueno') {
    principal = (
      <>
        <Tarjeta titulo="Leads sin primer contacto" marca numero={cantidad(b.leadsSinContacto, (d: ItemLeadSinContacto[]) => d.length)} data-bloque="leads-sin-contacto">
          <ConBloque<ItemLeadSinContacto[]> b={b.leadsSinContacto} onReintentar={recargar}>{(d) => <LeadsSinContacto items={d} />}</ConBloque>
        </Tarjeta>
        {paraLlamar}{sinRespuesta}{sinProximo}
      </>
    )
    lateral = (
      <>
        <Tarjeta titulo="Tiempo medio a la primera llamada" extra={<span className="rounded-full border border-border px-2 py-0.5 text-xs">Esta semana</span>} data-bloque="tiempo-medio">
          <ConBloque<TiempoMedio> b={b.tiempoMedio} onReintentar={recargar}>{(d) => <Tiempo t={d} />}</ConBloque>
        </Tarjeta>
        {tareasCoordinacion}{tasaciones}{numeros}
      </>
    )
  } else {
    principal = (
      <>
        <Tarjeta titulo="Mis tareas vencidas y de hoy" numero={tareasN} pie={tareasPie} data-bloque="tareas">
          <ConBloque<TareasDelDia> b={b.tareas} onReintentar={recargar}>{(d) => <Tareas datos={d} lectura={false} onCambio={recargar} siempre />}</ConBloque>
        </Tarjeta>
        <Tarjeta titulo="Mis procesos que esperan algo de mí" numero={cantidad(b.procesos, (d: ItemProcesoQueEspera[]) => d.length)} data-bloque="procesos">
          <ConBloque<ItemProcesoQueEspera[]> b={b.procesos} onReintentar={recargar}>{(d) => <Procesos items={d} />}</ConBloque>
        </Tarjeta>
      </>
    )
    lateral = !vacio(b.visitas) && (
      <Tarjeta titulo="Mis visitas y tasaciones de hoy" numero={cantidad(b.visitas, (d: VisitaDeHoy[]) => d.length)} data-bloque="visitas">
        <ConBloque<VisitaDeHoy[]> b={b.visitas} onReintentar={recargar}>{(d) => <Visitas items={d} />}</ConBloque>
      </Tarjeta>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {puedeConectarAvisos && <UnidentifiedBanner />}
      {/* Una recarga que falla no deja datos viejos sin avisar (revisión de código 7). */}
      {estado === 'error' && (
        <p role="alert" className="flex items-center gap-2 rounded-md border border-destructive/40 bg-card px-3 py-2 text-sm">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-destructive-texto" />
          <span className="flex-1">No se pudo actualizar: lo que ves puede estar desactualizado.</span>
          <button type="button" onClick={recargar} className="font-medium text-brand underline underline-offset-2">
            Reintentar
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{r.saludo}</h1>
        <p className="text-sm text-texto-suave">{r.fecha}</p>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.5fr_1fr]" data-inicio={r.rol}>
        <div className="flex min-w-0 flex-col gap-4" data-columna="principal">{principal}</div>
        <div className="flex min-w-0 flex-col gap-4" data-columna="lateral">{lateral}</div>
      </div>
    </div>
  )
}

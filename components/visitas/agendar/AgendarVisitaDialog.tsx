'use client'

/**
 * Ventana "Agendar visita" (diseño A — Claridad, pantalla A-Agendar del lienzo).
 * Lista de pasos a la izquierda (en el celular, barra de progreso arriba: el
 * diálogo base ya se vuelve hoja inferior por debajo de 640 px). Las reglas de
 * cada paso están en lib/visitas/agendar-estado.ts; el servidor revalida todo.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  estadoInicial, reducirAgendar, pasosVisibles, siguientePaso, pasoAnterior, errorDelPaso, armarPedido,
  type PasoAgendar, type PropiedadElegida,
} from '@/lib/visitas/agendar-estado'
import { puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import { ORIGEN_INFO } from '@/lib/visitas/origen'
import { construirInstante, formatearFechaHora } from '@/lib/visitas/horario'
import type { Role } from '@/types/auth.types'
import { leerRespuesta } from './leer-respuesta'
import { PasoPropiedad } from './PasoPropiedad'
import { PasoOrigen } from './PasoOrigen'
import { PasoPersona } from './PasoPersona'
import { PasoCuando } from './PasoCuando'
import { PasoAsesor, type Asesor } from './PasoAsesor'
import { PasoConfirmar, type DuplicadoVisita } from './PasoConfirmar'
import { LUGAR_PARA_LA_X } from './titulo-paso'
import { cn } from '@/lib/utils'

const ETIQUETA: Record<PasoAgendar, string> = {
  propiedad: 'Propiedad', origen: 'Origen', persona: 'Persona', cuando: 'Día y hora', asesor: 'Asesor', confirmar: 'Confirmar',
}

/** La ventana de debounce del ítem 1 (ronda 1): un segundo toque en el MISMO
 * botón ("Siguiente" que pasó a decir "Agendar") dentro de este margen se
 * ignora — evita que un doble clic rápido salte la pantalla de revisión. */
const VENTANA_DEBOUNCE_CONFIRMAR_MS = 700

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  propiedadId?: string
  onAgendada?: (visitaId: string) => void
}

interface PropiedadApi { id: string; address: string; neighborhood: string | null; foto: string | null; assigned_to: string | null }

/**
 * Ítem 12: valida que el `visita` de un 409 VISITA_DUPLICADA tenga forma
 * utilizable (id + scheduled_at, ambos string con fecha real) y decide si es
 * la MISMA visita que se pidió (mismo instante) o una visita DISTINTA de la
 * misma persona.
 */
function duplicadoDesdeCuerpo(cuerpo: Record<string, unknown>, instanteSolicitado: Date | null): DuplicadoVisita | null {
  const v = cuerpo.visita
  if (!v || typeof v !== 'object') return null
  const { id, scheduled_at } = v as Record<string, unknown>
  if (typeof id !== 'string' || typeof scheduled_at !== 'string') return null
  const instanteDuplicado = new Date(scheduled_at)
  if (Number.isNaN(instanteDuplicado.getTime())) return null
  const mismoInstante = instanteSolicitado !== null && instanteDuplicado.getTime() === instanteSolicitado.getTime()
  return { id, scheduled_at, mismoInstante }
}

export function AgendarVisitaDialog({ open, onOpenChange, propiedadId, onAgendada }: Props) {
  const router = useRouter()
  const [yo, setYo] = useState<{ id: string; role: Role } | null>(null)
  const [estado, despachar] = useReducer(reducirAgendar, estadoInicial({}))
  const [cargaInicial, setCargaInicial] = useState<'cargando' | 'ok' | 'error'>('cargando')
  const [intentoInicial, setIntentoInicial] = useState(0)
  const [avisoPropiedad, setAvisoPropiedad] = useState<string | null>(null)
  const [errorPaso, setErrorPaso] = useState<string | null>(null)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [duplicado, setDuplicado] = useState<DuplicadoVisita | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [asesores, setAsesores] = useState<Asesor[]>([])
  const [asesoresEstado, setAsesoresEstado] = useState<'cargando' | 'ok' | 'error'>('cargando')
  const [intentoAsesores, setIntentoAsesores] = useState(0)
  const enviandoRef = useRef(false)
  const marcaConfirmarRef = useRef(0)
  // Ítem 6: sube en cada apertura. Si el diálogo se cierra con un POST en
  // vuelo y se reabre antes de que responda, la respuesta vieja no tiene que
  // tocar el estado de ESTA apertura ni cerrarla.
  const generacionRef = useRef(0)
  const contenidoRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) generacionRef.current += 1 }, [open])

  // Al abrir: quién soy y, si viene de la ficha, la propiedad. Se reinicia TODO
  // (con `reiniciar`, así `propiedadFija` queda bien puesto desde el arranque).
  // Ítem 7: si la red falla, `cargaInicial` queda en 'error' con un botón
  // "Reintentar" (sube `intentoInicial`, que está en las dependencias). Si
  // `propiedadId` vino pero esa propiedad no volvió (no existe o no está
  // disponible), se arranca en el paso "Propiedad" con un aviso arriba.
  useEffect(() => {
    if (!open) { setCargaInicial('cargando'); return }
    let vigente = true
    setCargaInicial('cargando')
    ;(async () => {
      try {
        // /api/auth/me devuelve el perfil PLANO ({ id, role, full_name }), no `{ data }`.
        let quien: { id: string; role: Role } | null = null
        try {
          const r = await fetch('/api/auth/me')
          const j = (await r.json()) as { id?: string; role?: Role }
          if (r.ok && j.id && j.role) quien = { id: j.id, role: j.role }
        } catch { /* sin sesión: el servidor rechaza el alta igual */ }

        let propiedad: PropiedadElegida | null = null
        let aviso: string | null = null
        if (propiedadId) {
          const r = await leerRespuesta<PropiedadApi[]>(await fetch(`/api/visits/propiedades?id=${propiedadId}`))
          const p = r.ok ? r.data[0] : undefined
          if (p) propiedad = { id: p.id, address: p.address, neighborhood: p.neighborhood, foto: p.foto, asesorId: p.assigned_to }
          else aviso = 'Esa propiedad no está disponible para agendar.'
        }
        if (!vigente) return
        setYo(quien)
        setAvisoPropiedad(aviso)
        despachar({
          tipo: 'reiniciar',
          estado: estadoInicial({ propiedad, asesorPropio: quien && !puedeVerTodasLasVisitas(quien.role) ? quien.id : null }),
        })
        setErrorPaso(null); setErrorEnvio(null); setDuplicado(null)
        enviandoRef.current = false; setEnviando(false)
        setCargaInicial('ok')
      } catch {
        if (vigente) setCargaInicial('error')
      }
    })()
    return () => { vigente = false }
  }, [open, propiedadId, intentoInicial])

  // Ítem 5: los asesores se cargan UNA vez en el armazón (antes: un fetch en
  // PasoAsesor y OTRO acá solo para resolver el nombre — dos llamadas por
  // cada cambio de asesor elegido). El nombre sale de esta misma lista.
  // Ronda 2, ítem 2: `intentoAsesores` en las dependencias — el botón
  // "Reintentar" de PasoAsesor lo sube para volver a pedir la lista.
  useEffect(() => {
    if (!open) return
    let vigente = true
    setAsesoresEstado('cargando')
    fetch('/api/users/advisors').then(r => leerRespuesta<Asesor[]>(r))
      .then(r => { if (!vigente) return; if (r.ok) { setAsesores(r.data); setAsesoresEstado('ok') } else setAsesoresEstado('error') })
      .catch(() => { if (vigente) setAsesoresEstado('error') })
    return () => { vigente = false }
  }, [open, intentoAsesores])

  const listo = cargaInicial === 'ok'
  const opciones = { puedeElegirAsesor: yo ? puedeVerTodasLasVisitas(yo.role) : false }
  const pasos = pasosVisibles(estado, opciones)
  const indice = pasos.indexOf(estado.paso)
  const nombreAsesor = useMemo(() => asesores.find(a => a.id === estado.asesorId)?.full_name ?? null, [asesores, estado.asesorId])

  // Ítem 13: al cambiar de paso, el foco va al título de ESE paso (cada paso
  // trae su propio <h2 tabIndex={-1}>). Mejor para lectores de pantalla y
  // para que el teclado no se quede en un botón "Siguiente" que ya no existe.
  useEffect(() => {
    if (!listo) return
    const h2 = contenidoRef.current?.querySelector<HTMLElement>('h2[tabindex]')
    h2?.focus()
  }, [estado.paso, listo])

  // Ítem 9: cualquier cambio de ESTADO (elegir algo, tipear, navegar) limpia
  // el error del paso anterior — es la señal de que el asesor está
  // atendiendo lo que faltaba. `setErrorPaso` solo (sin despachar) no dispara
  // este efecto, así que el mensaje de `avanzar()` sigue visible hasta que
  // pasa algo de verdad.
  useEffect(() => { setErrorPaso(null) }, [estado])

  const valorDelPaso = (p: PasoAgendar): string => {
    if (p === 'propiedad') return estado.propiedad?.address ?? ''
    if (p === 'origen') return estado.origen ? ORIGEN_INFO[estado.origen].etiqueta : ''
    if (p === 'persona') return estado.persona?.nombre ?? ''
    if (p === 'cuando') {
      const i = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
      return i ? formatearFechaHora(i) : ''
    }
    if (p === 'asesor') return nombreAsesor ?? ''
    return ''
  }

  async function enviar(forzar: boolean) {
    if (enviandoRef.current) return
    const pedido = armarPedido(estado)
    if (!pedido) { setErrorEnvio('Faltan datos de la visita'); return }
    const miGeneracion = generacionRef.current
    enviandoRef.current = true; setEnviando(true); setErrorEnvio(null)
    try {
      const r = await leerRespuesta<{ id: string }>(await fetch('/api/visits', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...pedido, ...(forzar ? { forzarDuplicado: true } : {}) }),
      }))
      // El diálogo se cerró y volvió a abrir mientras este POST estaba en
      // vuelo: esta respuesta es de la apertura VIEJA — no toca nada ni cierra.
      if (miGeneracion !== generacionRef.current) return
      if (r.ok) {
        toast.success('Visita agendada', {
          action: { label: 'Ver visita', onClick: () => router.push(`/visits/${r.data.id}`) },
        })
        onAgendada?.(r.data.id)
        onOpenChange(false)
        router.refresh()
        return
      }
      if (r.status === 409 && r.cuerpo.code === 'VISITA_DUPLICADA') {
        const instanteSolicitado = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
        const d = duplicadoDesdeCuerpo(r.cuerpo, instanteSolicitado)
        if (!d) { setErrorEnvio('Algo falló. Probá de nuevo.'); return }
        marcaConfirmarRef.current = Date.now()
        setDuplicado(d)
        return
      }
      setErrorEnvio(r.error)
    } catch {
      if (miGeneracion !== generacionRef.current) return
      setErrorEnvio('No hay conexión. Probá de nuevo.')
    } finally {
      if (miGeneracion === generacionRef.current) { enviandoRef.current = false; setEnviando(false) }
    }
  }

  function avanzar() {
    // Ítem 1: "Siguiente" y "Agendar" son el MISMO botón. Un segundo toque
    // rápido en él, ya en Confirmar, no dispara otra vez — ni cuando ese
    // segundo toque es en realidad el que saltó de un paso anterior directo
    // a Confirmar (mismo nodo del DOM, closure vieja).
    if (estado.paso === 'confirmar' && Date.now() - marcaConfirmarRef.current < VENTANA_DEBOUNCE_CONFIRMAR_MS) return
    const e = errorDelPaso(estado, estado.paso)
    if (e) { setErrorPaso(e); return }
    setErrorPaso(null)
    const sig = siguientePaso(estado, opciones)
    if (sig) {
      if (sig === 'confirmar') marcaConfirmarRef.current = Date.now()
      despachar({ tipo: 'irA', paso: sig })
    } else {
      void enviar(duplicado !== null && !duplicado.mismoInstante)
    }
  }

  function volver() {
    setErrorPaso(null); setErrorEnvio(null); setDuplicado(null)
    const ant = pasoAnterior(estado, opciones)
    if (ant) despachar({ tipo: 'irA', paso: ant })
  }

  const esUltimo = indice === pasos.length - 1
  const props = { estado, despachar }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-[900px]">
        <DialogTitle className="sr-only">Agendar visita</DialogTitle>
        <DialogDescription className="sr-only">Paso {indice + 1} de {pasos.length}: {ETIQUETA[estado.paso]}</DialogDescription>
        <div className="grid md:min-h-[560px] md:grid-cols-[236px_1fr]">
          <aside className="hidden flex-col gap-5 border-r bg-secondary/60 p-5 md:flex">
            <div>
              <p className="text-base font-semibold">Agendar visita</p>
              <p className="text-xs text-muted-foreground">Toma menos de un minuto</p>
            </div>
            <ol className="space-y-1">
              {pasos.map((p, i) => {
                const hecho = i < indice
                const actual = i === indice
                return (
                  <li key={p} aria-current={actual ? 'step' : undefined}
                    className={cn('flex items-center gap-3 rounded-lg px-2 py-2', actual && 'bg-card shadow-sm')}>
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      actual ? 'bg-brand text-brand-foreground' : hecho ? 'bg-foreground text-background' : 'bg-border text-muted-foreground')}>
                      {hecho ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-sm', actual ? 'font-semibold' : 'text-foreground/80')}>{ETIQUETA[p]}</span>
                      {hecho && <span className="block truncate text-xs text-muted-foreground">{valorDelPaso(p)}</span>}
                    </span>
                  </li>
                )
              })}
            </ol>
          </aside>

          {/* Ítem 3: columna propia con `min-h-0` para que el cuerpo sea lo
              único que scrollea (el pie de Atrás/Siguiente queda `sticky` y
              siempre visible, incluso si el diálogo entero termina
              scrolleando en una pantalla muy baja). */}
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="h-1 shrink-0 bg-secondary md:hidden" aria-hidden="true">
              <div className="h-1 bg-brand transition-[width]" style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} />
            </div>
            {/* El lugar para la X de cerrar (en celular mide 44px, arriba a la
                derecha) NO va acá: en todo el contenido le comía 40px a cada fila
                de la lista. Va solo en lo que queda arriba — el título de cada
                paso (CLASE_TITULO_PASO) o el aviso/cargando que lo reemplaza
                (LUGAR_PARA_LA_X). Ver ./titulo-paso.ts. */}
            <div ref={contenidoRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto p-6">
              {cargaInicial === 'cargando' && <p className={cn('text-sm text-muted-foreground', LUGAR_PARA_LA_X)}>Cargando…</p>}
              {cargaInicial === 'error' && (
                <div className={cn('space-y-3', LUGAR_PARA_LA_X)}>
                  <p role="alert" className="text-sm text-destructive">No pudimos cargar los datos. Probá de nuevo.</p>
                  <Button type="button" variant="outline" onClick={() => setIntentoInicial(n => n + 1)}>Reintentar</Button>
                </div>
              )}
              {listo && (
                <>
                  {avisoPropiedad && estado.paso === 'propiedad' && (
                    <p role="alert" className={cn('text-sm text-destructive', LUGAR_PARA_LA_X)}>{avisoPropiedad}</p>
                  )}
                  {estado.paso === 'propiedad' && <PasoPropiedad {...props} />}
                  {estado.paso === 'origen' && <PasoOrigen {...props} />}
                  {estado.paso === 'persona' && <PasoPersona {...props} />}
                  {estado.paso === 'cuando' && <PasoCuando {...props} />}
                  {estado.paso === 'asesor' && (
                    <PasoAsesor {...props} asesores={asesores} cargando={asesoresEstado === 'cargando'}
                      error={asesoresEstado === 'error'} onReintentar={() => setIntentoAsesores(n => n + 1)} />
                  )}
                  {estado.paso === 'confirmar' && (
                    <PasoConfirmar {...props} nombreAsesor={nombreAsesor} duplicado={duplicado} error={errorEnvio} />
                  )}
                  {errorPaso && <p role="alert" className="text-sm text-destructive">{errorPaso}</p>}
                </>
              )}
            </div>
            <div className="sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t bg-background px-6 py-4">
              <Button variant="outline" onClick={volver} disabled={indice <= 0 || enviando}>Atrás</Button>
              <Button onClick={avanzar} disabled={!listo || enviando || Boolean(duplicado?.mismoInstante)}
                className="min-w-32 bg-brand text-brand-foreground hover:bg-brand/90">
                {enviando ? 'Agendando…' : esUltimo ? (duplicado && !duplicado.mismoInstante ? 'Agendar igual' : 'Agendar') : 'Siguiente'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

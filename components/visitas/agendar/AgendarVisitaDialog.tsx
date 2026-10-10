'use client'

/**
 * Ventana "Agendar visita" (diseño A — Claridad, pantalla A-Agendar del lienzo).
 * Lista de pasos a la izquierda (en el celular, barra de progreso arriba: el
 * diálogo base ya se vuelve hoja inferior por debajo de 640 px). Las reglas de
 * cada paso están en lib/visitas/agendar-estado.ts; el servidor revalida todo.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
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
import { PasoAsesor } from './PasoAsesor'
import { PasoConfirmar } from './PasoConfirmar'
import { cn } from '@/lib/utils'

const ETIQUETA: Record<PasoAgendar, string> = {
  propiedad: 'Propiedad', origen: 'Origen', persona: 'Persona', cuando: 'Día y hora', asesor: 'Asesor', confirmar: 'Confirmar',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  propiedadId?: string
  onAgendada?: (visitaId: string) => void
}

interface PropiedadApi { id: string; address: string; neighborhood: string | null; foto: string | null; assigned_to: string | null }

export function AgendarVisitaDialog({ open, onOpenChange, propiedadId, onAgendada }: Props) {
  const router = useRouter()
  const [yo, setYo] = useState<{ id: string; role: Role } | null>(null)
  const [estado, despachar] = useReducer(reducirAgendar, estadoInicial({}))
  const [listo, setListo] = useState(false)
  const [errorPaso, setErrorPaso] = useState<string | null>(null)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [duplicado, setDuplicado] = useState<{ scheduled_at: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [nombreAsesor, setNombreAsesor] = useState<string | null>(null)
  const enviandoRef = useRef(false)

  // Al abrir: quién soy y, si viene de la ficha, la propiedad. Se reinicia TODO
  // (con `reiniciar`, así `propiedadFija` queda bien puesto desde el arranque).
  useEffect(() => {
    if (!open) { setListo(false); return }
    let vigente = true
    ;(async () => {
      // /api/auth/me devuelve el perfil PLANO ({ id, role, full_name }), no `{ data }`.
      let quien: { id: string; role: Role } | null = null
      try {
        const r = await fetch('/api/auth/me')
        const j = (await r.json()) as { id?: string; role?: Role }
        if (r.ok && j.id && j.role) quien = { id: j.id, role: j.role }
      } catch { /* sin sesión: el servidor rechaza el alta igual */ }
      let propiedad: PropiedadElegida | null = null
      if (propiedadId) {
        const r = await leerRespuesta<PropiedadApi[]>(await fetch(`/api/visits/propiedades?id=${propiedadId}`))
        const p = r.ok ? r.data[0] : undefined
        if (p) propiedad = { id: p.id, address: p.address, neighborhood: p.neighborhood, foto: p.foto, asesorId: p.assigned_to }
      }
      if (!vigente) return
      setYo(quien)
      despachar({
        tipo: 'reiniciar',
        estado: estadoInicial({ propiedad, asesorPropio: quien && !puedeVerTodasLasVisitas(quien.role) ? quien.id : null }),
      })
      setErrorPaso(null); setErrorEnvio(null); setDuplicado(null); setListo(true)
    })()
    return () => { vigente = false }
  }, [open, propiedadId])

  const opciones = { puedeElegirAsesor: yo ? puedeVerTodasLasVisitas(yo.role) : false }
  const pasos = pasosVisibles(estado, opciones)
  const indice = pasos.indexOf(estado.paso)

  useEffect(() => {
    if (!estado.asesorId) { setNombreAsesor(null); return }
    fetch('/api/users/advisors').then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (r.ok) setNombreAsesor(r.data.find(a => a.id === estado.asesorId)?.full_name ?? null) })
  }, [estado.asesorId])

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
    enviandoRef.current = true; setEnviando(true); setErrorEnvio(null)
    try {
      const r = await leerRespuesta<{ id: string }>(await fetch('/api/visits', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...pedido, ...(forzar ? { forzarDuplicado: true } : {}) }),
      }))
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
        setDuplicado(r.cuerpo.visita as { scheduled_at: string })
        return
      }
      setErrorEnvio(r.error)
    } catch {
      setErrorEnvio('No hay conexión. Probá de nuevo.')
    } finally {
      enviandoRef.current = false; setEnviando(false)
    }
  }

  function avanzar() {
    const e = errorDelPaso(estado, estado.paso)
    if (e) { setErrorPaso(e); return }
    setErrorPaso(null)
    const sig = siguientePaso(estado, opciones)
    if (sig) despachar({ tipo: 'irA', paso: sig })
    else void enviar(duplicado !== null)
  }

  function volver() {
    setErrorPaso(null); setDuplicado(null)
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
        <div className="grid min-h-[560px] md:grid-cols-[236px_1fr]">
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

          <div className="flex min-w-0 flex-col">
            <div className="h-1 bg-secondary md:hidden" aria-hidden="true">
              <div className="h-1 bg-brand transition-[width]" style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} />
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {!listo ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
                <>
                  {estado.paso === 'propiedad' && <PasoPropiedad {...props} />}
                  {estado.paso === 'origen' && <PasoOrigen {...props} />}
                  {estado.paso === 'persona' && <PasoPersona {...props} />}
                  {estado.paso === 'cuando' && <PasoCuando {...props} />}
                  {estado.paso === 'asesor' && <PasoAsesor {...props} />}
                  {estado.paso === 'confirmar' && (
                    <PasoConfirmar {...props} nombreAsesor={nombreAsesor} duplicado={duplicado} error={errorEnvio} />
                  )}
                  {errorPaso && <p role="alert" className="text-sm text-destructive">{errorPaso}</p>}
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
              <Button variant="outline" onClick={volver} disabled={indice <= 0 || enviando}>Atrás</Button>
              <Button onClick={avanzar} disabled={!listo || enviando} className="min-w-32 bg-brand text-brand-foreground hover:bg-brand/90">
                {enviando ? 'Agendando…' : esUltimo ? (duplicado ? 'Agendar igual' : 'Agendar') : 'Siguiente'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

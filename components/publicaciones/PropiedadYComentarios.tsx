'use client'

/**
 * "Propiedad y comentarios": conectar el video a una propiedad y definir ahí
 * mismo qué responde cuando alguien comenta (público + privado con el botón a
 * la landing), en Instagram y Facebook. Las piezas son las de la ficha (palabras,
 * revisión de mensajes, modo) para que se vea y se valide EXACTAMENTE igual.
 *
 * Solo se manda a guardar lo que pasa `validarAutomatizacion`, la misma regla
 * que aplica el servidor: así el autoguardado nunca choca contra un 400.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, ChevronDown, ChevronUp, Loader2, MessageCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CampoPalabras } from '@/components/properties/reels/CampoPalabras'
import { mensajesDelReel, RevisionMensajes, type MensajesEditables } from '@/components/properties/reels/RevisionMensajes'
import { SelectorModo } from '@/components/properties/reels/SelectorModo'
import {
  automatizacionPorDefecto,
  conLineaDePalabra,
  mencionaPalabra,
  validarAutomatizacion,
  type AutomatizacionVideo,
} from '@/lib/publicaciones/automatizacion'
import type { PropiedadParaConectar } from '@/lib/publicaciones/propiedades'
import type { VideoVista } from '@/lib/publicaciones/tipos'
import { ETIQUETA_MODO, type ModoReel } from '@/lib/social/reels/modo'
import { separarPalabras } from '@/lib/social/reels/palabra-clave'
import type { CambiosVideo } from './FilaRevision'
import { api } from './leer-json'

interface Interruptores {
  automatizacionGeneral: boolean
  privadosActivos: boolean
}

interface Borrador {
  palabras: string
  mensajes: MensajesEditables
  modo: ModoReel
}

function borradorDe(guardada: unknown): Borrador {
  const v = validarAutomatizacion(guardada)
  const a: AutomatizacionVideo = v.ok ? v.valor : automatizacionPorDefecto()
  return { palabras: a.palabras, mensajes: mensajesDelReel(a), modo: a.modo }
}

function aConfig(b: Borrador): unknown {
  const utiles = (f: string[]) => f.map((x) => x.trim()).filter(Boolean)
  return {
    palabras: b.palabras,
    respuestas_con_privado: utiles(b.mensajes.respuestas_con_privado),
    respuestas_sin_privado: utiles(b.mensajes.respuestas_sin_privado),
    dm_texto: b.mensajes.dm_texto,
    dm_boton: b.mensajes.dm_boton,
    dm_seguimiento: b.mensajes.dm_seguimiento,
    modo: b.modo,
  }
}

interface Props {
  video: VideoVista
  editable: boolean
  onCambio: (campos: CambiosVideo) => void
}

export function PropiedadYComentarios({ video, editable, onCambio }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [propiedad, setPropiedad] = useState<PropiedadParaConectar | null>(null)
  const [interruptores, setInterruptores] = useState<Interruptores>({ automatizacionGeneral: false, privadosActivos: false })
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<PropiedadParaConectar[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(video.automatizacion))
  const [problema, setProblema] = useState<string | null>(null)

  // La propiedad ya elegida (al recargar la página), para mostrar su nombre y si tiene landing.
  useEffect(() => {
    if (!video.property_id || propiedad?.id === video.property_id) return
    let vivo = true
    api<{ propiedades: PropiedadParaConectar[]; instagram: Interruptores }>(`/api/publicaciones/propiedades?id=${video.property_id}`)
      .then((r) => {
        if (!vivo) return
        setPropiedad(r.propiedades[0] ?? null)
        setInterruptores(r.instagram)
      })
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [video.property_id, propiedad?.id])

  // Búsqueda con espera: una consulta cuando se deja de tipear, no una por tecla.
  useEffect(() => {
    // Con menos de 2 letras no se busca: la lista se esconde al renderizar (`buscable`).
    if (busqueda.trim().length < 2) return
    let vivo = true
    const t = setTimeout(() => {
      setBuscando(true)
      setErrorBusqueda(null)
      api<{ propiedades: PropiedadParaConectar[]; instagram: Interruptores }>(`/api/publicaciones/propiedades?q=${encodeURIComponent(busqueda)}`)
        .then((r) => {
          if (!vivo) return
          setResultados(r.propiedades)
          setInterruptores(r.instagram)
        })
        .catch((e: unknown) => vivo && setErrorBusqueda(e instanceof Error ? e.message : 'No se pudo buscar'))
        .finally(() => vivo && setBuscando(false))
    }, 300)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [busqueda])

  const landing = propiedad?.landingPublicada ?? false
  const buscable = busqueda.trim().length >= 2
  const sinLinea = !!video.property_id && !!borrador.palabras && !mencionaPalabra(video.descripcion, borrador.palabras)

  /** Guarda el borrador si es válido; si no, muestra el motivo y no manda nada. */
  const aplicar = (entrada: Borrador, palabrasCambiaron: boolean) => {
    // Al escribir la PRIMERA palabra arranca en Modo prueba (decisión del spec): antes no podía estar en otro modo.
    const primera = palabrasCambiaron && !separarPalabras(borrador.palabras).length && separarPalabras(entrada.palabras).length > 0
    const nuevo = primera && landing && entrada.modo === 'apagado' ? { ...entrada, modo: 'prueba' as const } : entrada
    setBorrador(nuevo)
    const config = validarAutomatizacion(aConfig(nuevo))
    if (!config.ok) {
      setProblema(config.error)
      return
    }
    setProblema(null)
    const campos: CambiosVideo = { automatizacion: config.valor }
    // La línea "Comentá «X»" va en la descripción visible. Mientras la IA todavía escribe, no se toca.
    if (palabrasCambiaron && video.etapa === 'listo') campos.descripcion = conLineaDePalabra(video.descripcion, config.valor.palabras)
    onCambio(campos)
  }

  const elegir = (p: PropiedadParaConectar) => {
    setPropiedad(p)
    setBusqueda('')
    setResultados(null)
    // Sin palabra todavía queda Apagado: la regla no deja otro modo sin palabra.
    const inicial: Borrador = { ...borradorDe(null), modo: 'apagado' }
    setBorrador(inicial)
    setProblema(null)
    const config = validarAutomatizacion(aConfig(inicial))
    onCambio({ property_id: p.id, automatizacion: config.ok ? config.valor : null })
  }

  const quitar = () => {
    setPropiedad(null)
    setBorrador(borradorDe(null))
    setProblema(null)
    onCambio({
      property_id: null,
      automatizacion: null,
      ...(video.etapa === 'listo' ? { descripcion: conLineaDePalabra(video.descripcion, '') } : {}),
    })
  }

  const resumen = useMemo(() => {
    if (!video.property_id) return 'Sin propiedad'
    const nombre = propiedad?.direccion ?? 'Propiedad'
    return `${nombre} · ${ETIQUETA_MODO[borrador.modo]}`
  }, [video.property_id, propiedad?.direccion, borrador.modo])

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium">Propiedad y comentarios</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{resumen}</span>
        {(sinLinea || problema) && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-label="Hay algo para revisar" />}
        {abierto ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />}
      </button>

      {abierto && (
        <div className="space-y-3 border-t p-3">
          {!video.property_id ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Opcional. Si el video es de una propiedad, conectala y cuando salga va a responder los comentarios en Instagram y
                Facebook, y mandar el privado con el botón a su landing.
              </p>
              <Input
                aria-label="Buscar propiedad por dirección"
                placeholder="Buscar por dirección…"
                value={busqueda}
                disabled={!editable}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {buscando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Buscando" />}
              {errorBusqueda && <p className="text-xs text-destructive">{errorBusqueda}</p>}
              {buscable && resultados && resultados.length === 0 && <p className="text-xs text-muted-foreground">No encontré propiedades con esa dirección.</p>}
              {buscable && resultados && resultados.length > 0 && (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {resultados.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => elegir(p)}
                      >
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {p.direccion}
                          {p.barrio ? ` · ${p.barrio}` : ''}
                        </span>
                        {!p.landingPublicada && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            sin landing
                          </Badge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={`/properties/${video.property_id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {propiedad?.direccion ?? 'Propiedad'}
                </a>
                {editable && (
                  <Button size="sm" variant="ghost" onClick={quitar}>
                    <X className="mr-1 h-3.5 w-3.5" aria-hidden /> Quitar
                  </Button>
                )}
              </div>

              {propiedad && !landing && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Publicá la landing de la propiedad: el botón del privado lleva ahí. Mientras tanto queda Apagado.
                </p>
              )}

              <CampoPalabras
                id={`palabras-${video.id}`}
                valor={borrador.palabras}
                deshabilitado={!editable}
                onCambiar={(palabras) => aplicar({ ...borrador, palabras }, true)}
              />
              {sinLinea && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  La descripción no dice qué comentar: nadie va a escribir «{separarPalabras(borrador.palabras)[0]}» si no lo lee.
                </p>
              )}

              <RevisionMensajes
                valor={borrador.mensajes}
                onCambiar={(mensajes) => aplicar({ ...borrador, mensajes }, false)}
                palabraDeEjemplo={separarPalabras(borrador.palabras)[0] ?? 'INFO'}
                slugLanding={propiedad?.landingSlug ?? null}
                privadosActivos={interruptores.privadosActivos}
                deshabilitado={!editable}
              />

              <SelectorModo
                valor={borrador.modo}
                onCambiar={(modo) => aplicar({ ...borrador, modo }, false)}
                landingPublicada={landing}
                hayPalabras={separarPalabras(borrador.palabras).length > 0}
                automatizacionGeneral={interruptores.automatizacionGeneral}
                deshabilitado={!editable}
              />
              <p className="text-[11px] text-muted-foreground">
                En Facebook, el Modo prueba solo anota lo que habría respondido: para probarlo de verdad ahí, usá En vivo con un video de prueba.
              </p>

              {problema && (
                <p role="alert" className="text-xs text-destructive">
                  {problema}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

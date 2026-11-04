'use client'

/**
 * "Comentarios" de un video: si responde, cómo, y a dónde lleva el privado.
 *
 *  - No responder.
 *  - De una propiedad: se ELIGE de la lista de propiedades en cartera; el botón del
 *    privado lleva a su landing.
 *  - Personalizado: no es de una propiedad; se escribe el mensaje y a dónde lleva
 *    el botón (un WhatsApp, una landing de tasación…).
 *
 * En los dos casos hay que tocar "Confirmar": sin eso no se programa (lo frena
 * también el servidor). Cambiar algo después vuelve a pedir confirmación, así lo
 * que sale a los clientes es siempre lo último que una persona aprobó.
 *
 * Las piezas (palabras, mensajes, modo) son las de la ficha, con las mismas reglas.
 * Solo se guarda lo que pasa `validarAutomatizacion`, igual que en el servidor.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle, Building2, Check, ChevronDown, ChevronUp, Link2, Loader2, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CampoPalabras } from '@/components/properties/reels/CampoPalabras'
import { mensajesDelReel, RevisionMensajes, type MensajesEditables } from '@/components/properties/reels/RevisionMensajes'
import { SelectorModo } from '@/components/properties/reels/SelectorModo'
import {
  automatizacionPorDefecto,
  conLineaDePalabra,
  limpiarEnlace,
  mencionaPalabra,
  validarAutomatizacion,
  type AutomatizacionVideo,
  type TipoAutomatizacion,
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

type Opcion = 'ninguno' | TipoAutomatizacion

interface Borrador {
  tipo: TipoAutomatizacion
  enlace: string
  palabras: string
  mensajes: MensajesEditables
  modo: ModoReel
  confirmada: boolean
}

function borradorDe(guardada: unknown, tipo?: TipoAutomatizacion): Borrador {
  const v = validarAutomatizacion(guardada)
  const a: AutomatizacionVideo = v.ok ? v.valor : automatizacionPorDefecto()
  return {
    tipo: tipo ?? a.tipo,
    enlace: a.enlace ?? '',
    palabras: a.palabras,
    mensajes: mensajesDelReel(a),
    modo: a.modo,
    confirmada: v.ok && a.confirmada,
  }
}

function aConfig(b: Borrador): unknown {
  const utiles = (f: string[]) => f.map((x) => x.trim()).filter(Boolean)
  return {
    tipo: b.tipo,
    enlace: b.tipo === 'personalizado' ? b.enlace : null,
    confirmada: b.confirmada,
    palabras: b.palabras,
    respuestas_con_privado: utiles(b.mensajes.respuestas_con_privado),
    respuestas_sin_privado: utiles(b.mensajes.respuestas_sin_privado),
    dm_texto: b.mensajes.dm_texto,
    dm_boton: b.mensajes.dm_boton,
    dm_seguimiento: b.mensajes.dm_seguimiento,
    modo: b.modo,
  }
}

const OPCIONES: { valor: Opcion; titulo: string }[] = [
  { valor: 'ninguno', titulo: 'No responder' },
  { valor: 'propiedad', titulo: 'De una propiedad' },
  { valor: 'personalizado', titulo: 'Personalizado' },
]

interface Props {
  video: VideoVista
  editable: boolean
  onCambio: (campos: CambiosVideo) => void
}

export function PropiedadYComentarios({ video, editable, onCambio }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [propiedades, setPropiedades] = useState<PropiedadParaConectar[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [interruptores, setInterruptores] = useState<Interruptores>({ automatizacionGeneral: false, privadosActivos: false })
  const [opcion, setOpcion] = useState<Opcion>(() => (video.automatizacion ? borradorDe(video.automatizacion).tipo : 'ninguno'))
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(video.automatizacion))
  const [problema, setProblema] = useState<string | null>(null)
  // Si la persona eligió un modo a mano (o ya había confirmado uno), no se lo cambiamos solos.
  const [modoTocado, setModoTocado] = useState(() => borradorDe(video.automatizacion).confirmada)

  // La lista de propiedades se pide al abrir (y una sola vez): son las que están en cartera.
  useEffect(() => {
    if (!abierto || propiedades !== null) return
    let vivo = true
    api<{ propiedades: PropiedadParaConectar[]; instagram: Interruptores }>('/api/publicaciones/propiedades?todas=1')
      .then((r) => {
        if (!vivo) return
        setPropiedades(r.propiedades)
        setInterruptores(r.instagram)
      })
      .catch((e: unknown) => vivo && setErrorLista(e instanceof Error ? e.message : 'No se pudo cargar la lista de propiedades'))
    return () => {
      vivo = false
    }
  }, [abierto, propiedades])

  const propiedad = propiedades?.find((p) => p.id === video.property_id) ?? null
  const landing = propiedad?.landingPublicada ?? false
  // A dónde lleva el botón del privado: para el modo y para mostrarlo en la revisión.
  const destinoDe = (b: Borrador, landingPublicada = landing) =>
    b.tipo === 'personalizado' ? !!limpiarEnlace(b.enlace) : landingPublicada
  const hayDestino = destinoDe(borrador)

  /**
   * En Publicaciones el modo es En vivo apenas hay palabra y destino (decisión del dueño,
   * 2026-11-04: el video sale publicado para todos, así que el Modo prueba no tiene sentido
   * acá; la aprobación es el "Confirmar"). Sin destino o sin palabra, Apagado. Si la persona
   * eligió un modo a mano, se respeta.
   */
  const conModo = (b: Borrador, landingPublicada = landing): Borrador => {
    if (modoTocado) return b
    const listo = destinoDe(b, landingPublicada) && separarPalabras(b.palabras).length > 0
    return { ...b, modo: listo ? 'en_vivo' : 'apagado' }
  }
  const sinLinea = opcion !== 'ninguno' && !!borrador.palabras && !mencionaPalabra(video.descripcion, borrador.palabras)

  /**
   * Guarda el borrador si es válido. Cualquier cambio deja la configuración SIN confirmar
   * (salvo el propio "Confirmar"): lo que sale es lo último que se aprobó.
   */
  const aplicar = (entrada: Borrador, opciones: { palabrasCambiaron?: boolean; confirmar?: boolean } = {}) => {
    const nuevo: Borrador = { ...conModo(entrada), confirmada: !!opciones.confirmar }
    setBorrador(nuevo)
    const config = validarAutomatizacion(aConfig(nuevo))
    if (!config.ok) {
      setProblema(config.error)
      if (opciones.confirmar) setBorrador({ ...nuevo, confirmada: false })
      return
    }
    setProblema(null)
    const campos: CambiosVideo = { automatizacion: config.valor }
    // La línea "Comentá «X»" va en la descripción visible. Mientras la IA todavía escribe, no se toca.
    if (opciones.palabrasCambiaron && video.etapa === 'listo') campos.descripcion = conLineaDePalabra(video.descripcion, config.valor.palabras)
    onCambio(campos)
  }

  const elegirOpcion = (o: Opcion) => {
    setOpcion(o)
    setProblema(null)
    if (o === 'ninguno') {
      setBorrador(borradorDe(null))
      onCambio({
        property_id: null,
        automatizacion: null,
        ...(video.etapa === 'listo' ? { descripcion: conLineaDePalabra(video.descripcion, '') } : {}),
      })
      return
    }
    // Se conservan palabra y mensajes al cambiar de tipo; el tipo nuevo arranca sin confirmar.
    const nuevo: Borrador = conModo({ ...borrador, tipo: o, confirmada: false })
    setBorrador(nuevo)
    if (o === 'propiedad' && !video.property_id) return // se guarda al elegir la propiedad
    const config = validarAutomatizacion(aConfig(nuevo))
    if (config.ok) onCambio({ automatizacion: config.valor })
  }

  const elegirPropiedad = (id: string) => {
    if (!id) return
    const elegida = propiedades?.find((p) => p.id === id)
    const nuevo: Borrador = conModo({ ...borrador, tipo: 'propiedad', confirmada: false }, elegida?.landingPublicada ?? false)
    setBorrador(nuevo)
    const config = validarAutomatizacion(aConfig(nuevo))
    onCambio({ property_id: id, automatizacion: config.ok ? config.valor : null })
  }

  const resumen =
    opcion === 'ninguno'
      ? 'No responde'
      : `${opcion === 'personalizado' ? 'Personalizado' : (propiedad?.direccion ?? 'Elegí la propiedad')} · ${ETIQUETA_MODO[borrador.modo]}`

  const listoParaConfirmar = opcion !== 'ninguno' && (opcion === 'personalizado' || !!video.property_id)

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium">Comentarios</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{resumen}</span>
        {opcion !== 'ninguno' &&
          (borrador.confirmada ? (
            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
              <Check className="h-3 w-3" aria-hidden /> Confirmado
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 border-amber-500 text-[10px] text-amber-700 dark:text-amber-400">
              Sin confirmar
            </Badge>
          ))}
        {abierto ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />}
      </button>

      {abierto && (
        <div className="space-y-3 border-t p-3">
          <div role="radiogroup" aria-label="Qué hace con los comentarios" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {OPCIONES.map((o) => (
              <Button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={opcion === o.valor}
                variant={opcion === o.valor ? 'default' : 'outline'}
                size="sm"
                disabled={!editable}
                onClick={() => elegirOpcion(o.valor)}
              >
                {o.titulo}
              </Button>
            ))}
          </div>

          {opcion === 'ninguno' && (
            <p className="text-xs text-muted-foreground">Este video no va a responder comentarios.</p>
          )}

          {opcion === 'propiedad' && (
            <div className="space-y-1.5">
              <Label htmlFor={`propiedad-${video.id}`} className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden /> Propiedad
              </Label>
              {propiedades === null && !errorLista ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Cargando propiedades" />
              ) : errorLista ? (
                <p className="text-xs text-destructive">{errorLista}</p>
              ) : (
                <select
                  id={`propiedad-${video.id}`}
                  className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
                  value={video.property_id ?? ''}
                  disabled={!editable}
                  onChange={(e) => elegirPropiedad(e.target.value)}
                >
                  <option value="">Elegí la propiedad…</option>
                  {(propiedades ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.direccion}
                      {p.landingPublicada ? '' : ' (sin landing)'}
                    </option>
                  ))}
                </select>
              )}
              {propiedad && !landing && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Esta propiedad no tiene la landing publicada: el botón del privado lleva ahí. Mientras tanto queda Apagado.
                </p>
              )}
            </div>
          )}

          {opcion === 'personalizado' && (
            <div className="space-y-1.5">
              <Label htmlFor={`enlace-${video.id}`} className="flex items-center gap-1.5">
                <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden /> ¿A dónde lleva el botón del privado?
              </Label>
              <Input
                id={`enlace-${video.id}`}
                inputMode="url"
                placeholder="https://wa.me/549… o https://…"
                value={borrador.enlace}
                disabled={!editable}
                onChange={(e) => setBorrador({ ...borrador, enlace: e.target.value, confirmada: false })}
                onBlur={() => aplicar(borrador)}
              />
              <p className="text-[11px] text-muted-foreground">Un WhatsApp, una landing de tasación o cualquier página que empiece con https://.</p>
            </div>
          )}

          {listoParaConfirmar && (
            <>
              <CampoPalabras
                id={`palabras-${video.id}`}
                valor={borrador.palabras}
                deshabilitado={!editable}
                onCambiar={(palabras) => aplicar({ ...borrador, palabras }, { palabrasCambiaron: true })}
              />
              {sinLinea && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  La descripción no dice qué comentar: nadie va a escribir «{separarPalabras(borrador.palabras)[0]}» si no lo lee.
                </p>
              )}

              <RevisionMensajes
                valor={borrador.mensajes}
                onCambiar={(mensajes) => aplicar({ ...borrador, mensajes })}
                palabraDeEjemplo={separarPalabras(borrador.palabras)[0] ?? 'INFO'}
                slugLanding={propiedad?.landingSlug ?? null}
                {...(opcion === 'personalizado' ? { enlaceDestino: limpiarEnlace(borrador.enlace) } : {})}
                privadosActivos={interruptores.privadosActivos}
                soloPrivado
                deshabilitado={!editable}
              />

              <SelectorModo
                valor={borrador.modo}
                onCambiar={(modo) => {
                  setModoTocado(true)
                  aplicar({ ...borrador, modo })
                }}
                landingPublicada={hayDestino}
                hayPalabras={separarPalabras(borrador.palabras).length > 0}
                automatizacionGeneral={interruptores.automatizacionGeneral}
                deshabilitado={!editable}
              />
              <p className="text-[11px] text-muted-foreground">
                Responde en Instagram y Facebook. En Facebook, el Modo prueba solo anota lo que habría respondido.
              </p>

              {problema && (
                <p role="alert" className="text-xs text-destructive">
                  {problema}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                {borrador.confirmada ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" aria-hidden /> Confirmado: así va a responder
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Revisá todo y confirmá para poder programar.</span>
                )}
                <Button size="sm" disabled={!editable || borrador.confirmada} onClick={() => aplicar(borrador, { confirmar: true })}>
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> Confirmar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

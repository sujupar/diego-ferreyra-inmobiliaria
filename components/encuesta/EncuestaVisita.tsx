'use client'
/**
 * La encuesta post-visita estilo Typeform (spec §3.6, §4.9 + adenda §11.3). Componente propio, sin
 * dependencias nuevas ni framer-motion. El servidor pinta la primera pantalla ya armada; desde ahí:
 *   - cada respuesta se GUARDA antes de avanzar (si falla, se queda y lo dice);
 *   - "Sí/No" y el precio avanzan solos a los 350 ms; las de varias piden "OK";
 *   - "Abierta" la marca ESTE navegador una vez (el previsualizador de WhatsApp no corre JS);
 *   - el foco va al título al cambiar de paso (no al cargar: iOS abre el teclado solo dentro de un toque);
 *   - el final se manda UNA vez (ref de ocupado + reserva atómica del servidor) y los avisos
 *     (email al equipo, regalo) los pide la pantalla de gracias aparte, con keepalive.
 */
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { avance, pasoAnterior } from '@/lib/visitas/encuesta/pasos'
import { textoMonto } from '@/lib/visitas/encuesta/oferta'
import { urlDescargaDelRegalo, type EncuestaPublica } from '@/lib/visitas/encuesta/publica'
import {
  estadoInicial, reducir, puedeAvanzar, cuerpoDelPaso, cuerpoFinalDelEstado, esPasoEncuesta,
  type AccionReproductor, type CuerpoPasoCliente,
} from '@/lib/visitas/encuesta/reproductor'
import { OPINIONES_PRECIO, PASOS_ENCUESTA, type OpinionPrecio } from '@/lib/visitas/encuesta/tipos'
import { LETRAS, BarraDeAvance, BotonAtras, Bienvenida, PreguntaUnica, PreguntaVarias, PreguntaOferta, PasoContacto, Gracias } from './PantallasEncuesta'

export const ESPERA_AUTOAVANCE_MS = 350
const NO_GUARDO = 'No pudimos guardar tu respuesta. Revisá la conexión y probá de nuevo.'
const NO_ENVIO = 'No pudimos enviar tus respuestas. Probá de nuevo.'
const OPCIONES_GUSTO = [{ valor: true, etiqueta: 'Sí' }, { valor: false, etiqueta: 'No' }] as const
const ETIQUETA_PRECIO: Record<OpinionPrecio, string> = { correcto: 'Correcto', alto: 'Alto', bajo: 'Bajo' }
const OPCIONES_PRECIO = OPINIONES_PRECIO.map(v => ({ valor: v, etiqueta: ETIQUETA_PRECIO[v] }))

async function leerCuerpo(res: Response): Promise<Record<string, unknown>> {
  try {
    const j: unknown = await res.json()
    return j && typeof j === 'object' ? { ...j } : {}
  } catch {
    return {}
  }
}

/** La descarga que devolvió el final, sin `as`: se mira la forma paso a paso. */
function descargaDe(j: Record<string, unknown>): string | null {
  const data = j.data
  if (!data || typeof data !== 'object' || !('regalo' in data)) return null
  const regalo = data.regalo
  if (!regalo || typeof regalo !== 'object' || !('descarga' in regalo)) return null
  return typeof regalo.descarga === 'string' ? regalo.descarga : null
}

/** "¿Te gustó…?" → "Mariana, ¿te gustó…?": la minúscula va DESPUÉS del "¿". */
function conNombre(nombre: string, pregunta: string): string {
  if (!nombre) return pregunta
  const i = pregunta.startsWith('¿') ? 1 : 0
  return `${nombre}, ${pregunta.slice(0, i)}${pregunta.charAt(i).toLowerCase()}${pregunta.slice(i + 1)}`
}

export function EncuestaVisita({ encuesta }: { encuesta: EncuestaPublica }) {
  const [s, despachar] = useReducer(reducir, encuesta, estadoInicial)
  const [dejoEmail, setDejoEmail] = useState(encuesta.emailDejado)
  const tituloRef = useRef<HTMLHeadingElement | null>(null)
  const ocupadoRef = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const primerPaso = useRef(true)
  const abiertaMarcada = useRef(false)
  const base = `/api/public/encuesta/${encuesta.token}`
  const telPrecargado = encuesta.telefonoEnmascarado !== null

  useEffect(() => {
    if (encuesta.completa || abiertaMarcada.current) return
    abiertaMarcada.current = true
    void fetch(base, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paso: 'abierta' }), keepalive: true,
    }).catch(() => {})
  }, [base, encuesta.completa])

  useEffect(() => {
    if (primerPaso.current) { primerPaso.current = false; return }
    tituloRef.current?.focus()
    document.title = s.paso === 'gracias' ? 'Gracias · Encuesta de tu visita' : `Paso ${PASOS_ENCUESTA.indexOf(s.paso)} · Encuesta de tu visita`
  }, [s.paso])

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  async function guardar(cuerpo: CuerpoPasoCliente) {
    if (ocupadoRef.current) return
    ocupadoRef.current = true
    despachar({ tipo: 'ocupado' })
    try {
      const res = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await leerCuerpo(res)
      if (res.ok) despachar({ tipo: 'avanzar' })
      else if (j.code === 'COMPLETA') despachar({ tipo: 'terminado', descarga: encuesta.regalo ? urlDescargaDelRegalo(encuesta.token) : null })
      else despachar({ tipo: 'error', mensaje: typeof j.error === 'string' ? j.error : NO_GUARDO })
    } catch {
      despachar({ tipo: 'error', mensaje: NO_GUARDO })
    } finally {
      ocupadoRef.current = false
    }
  }

  function elegirYAvanzar(accion: AccionReproductor, cuerpo: CuerpoPasoCliente) {
    if (ocupadoRef.current) return
    despachar(accion)
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => { void guardar(cuerpo) }, ESPERA_AUTOAVANCE_MS)
  }

  async function terminar() {
    if (ocupadoRef.current) return
    ocupadoRef.current = true
    despachar({ tipo: 'ocupado' })
    const cuerpo = cuerpoFinalDelEstado(s)
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await leerCuerpo(res)
      if (res.ok) {
        setDejoEmail(cuerpo.email !== null)
        despachar({ tipo: 'terminado', descarga: descargaDe(j) })
        void fetch(`${base}/avisos`, { method: 'POST', keepalive: true }).catch(() => {})
      } else if (res.status === 409 && esPasoEncuesta(j.paso)) {
        despachar({ tipo: 'ir_a', paso: j.paso, mensaje: 'Falta responder esta pregunta' })
      } else {
        despachar({ tipo: 'error', mensaje: typeof j.error === 'string' ? j.error : NO_ENVIO })
      }
    } catch {
      despachar({ tipo: 'error', mensaje: NO_ENVIO })
    } finally {
      ocupadoRef.current = false
    }
  }

  function okDelPaso() {
    if (!puedeAvanzar(s, telPrecargado) || ocupadoRef.current) return
    if (s.paso === 'bienvenida') { despachar({ tipo: 'empezar' }); return }
    if (s.paso === 'contacto') { void terminar(); return }
    const cuerpo = cuerpoDelPaso(s)
    if (cuerpo) void guardar(cuerpo)
  }

  // Teclado en computadora: letras sobre las opciones y Enter para seguir. Sin lista de dependencias
  // a propósito: se re-engancha en cada render y siempre ve el estado actual.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      if (e.key === 'Enter') {
        if (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement) return
        e.preventDefault()
        okDelPaso()
        return
      }
      const i = LETRAS.indexOf(e.key.toUpperCase())
      if (e.key.length !== 1 || i < 0) return
      if (s.paso === 'gusto' && i < OPCIONES_GUSTO.length) {
        const valor = OPCIONES_GUSTO[i].valor
        elegirYAvanzar({ tipo: 'elegir_gusto', valor }, { paso: 'gusto', valor })
      } else if (s.paso === 'precio' && i < OPCIONES_PRECIO.length) {
        const valor = OPCIONES_PRECIO[i].valor
        elegirYAvanzar({ tipo: 'elegir_precio', valor }, { paso: 'precio', valor })
      } else if (s.paso === 'mas_gusto' || s.paso === 'menos_gusto') {
        const lista = s.paso === 'mas_gusto' ? encuesta.opciones.masGusto : encuesta.opciones.menosGusto
        if (i < lista.length) despachar({ tipo: 'alternar', paso: s.paso, clave: lista[i].clave })
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  const r = s.respuestas
  const puede = puedeAvanzar(s, telPrecargado)
  const mostrarAtras = pasoAnterior(s.paso) !== null

  // Una VARIABLE con el JSX del paso, no un componente declarado acá adentro (CLAUDE.md § A/B).
  let pantalla: ReactNode
  switch (s.paso) {
    case 'bienvenida':
      pantalla = <Bienvenida encuesta={encuesta} tituloRef={tituloRef} onEmpezar={() => despachar({ tipo: 'empezar' })} />
      break
    case 'gusto':
      pantalla = (
        <PreguntaUnica titulo={conNombre(encuesta.nombre, `¿Te gustó ${encuesta.direccion}?`)} opciones={OPCIONES_GUSTO} elegida={r.liked}
          tituloRef={tituloRef} ocupado={s.ocupado}
          onElegir={valor => elegirYAvanzar({ tipo: 'elegir_gusto', valor }, { paso: 'gusto', valor })} />
      )
      break
    case 'mas_gusto':
    case 'menos_gusto': {
      const mas = s.paso === 'mas_gusto'
      const paso = s.paso
      pantalla = (
        <PreguntaVarias id={paso} titulo={mas ? '¿Qué fue lo que más te gustó?' : '¿Y lo que menos te gustó?'}
          opciones={mas ? encuesta.opciones.masGusto : encuesta.opciones.menosGusto}
          elegidas={mas ? r.most_liked_tags : r.least_liked_tags} otra={mas ? r.most_liked_other : r.least_liked_other}
          onAlternar={clave => despachar({ tipo: 'alternar', paso, clave })}
          onOtra={texto => despachar({ tipo: 'escribir_otra', paso, texto })}
          onOk={okDelPaso} puedeOk={puede} tituloRef={tituloRef} ocupado={s.ocupado} />
      )
      break
    }
    case 'precio':
      pantalla = (
        <PreguntaUnica
          titulo={encuesta.precio ? `Está publicada en ${textoMonto(encuesta.precio, encuesta.moneda)}. ¿Te parece…?` : '¿Qué te parece el precio?'}
          opciones={OPCIONES_PRECIO} elegida={r.price_opinion} tituloRef={tituloRef} ocupado={s.ocupado}
          onElegir={valor => elegirYAvanzar({ tipo: 'elegir_precio', valor }, { paso: 'precio', valor })} />
      )
      break
    case 'oferta':
      pantalla = (
        <PreguntaOferta encuesta={encuesta} texto={s.ofertaTexto} tituloRef={tituloRef} ocupado={s.ocupado} puedeOk={puede} onOk={okDelPaso}
          onTexto={texto => despachar({ tipo: 'escribir_oferta', texto })}
          onAtajo={monto => despachar({ tipo: 'atajo_oferta', monto })}
          onDeclinar={() => { despachar({ tipo: 'declinar_oferta' }); void guardar({ paso: 'oferta', monto: null, declina: true }) }} />
      )
      break
    case 'contacto':
      pantalla = (
        <PasoContacto encuesta={encuesta} contacto={s.contacto} tituloRef={tituloRef} ocupado={s.ocupado} puedeEnviar={puede}
          onCambio={cambios => despachar({ tipo: 'contacto', cambios })} onEnviar={() => void terminar()} />
      )
      break
    case 'gracias':
      pantalla = <Gracias encuesta={encuesta} descarga={s.descarga} dejoEmail={dejoEmail} tituloRef={tituloRef} />
      break
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        {mostrarAtras
          ? <BotonAtras onAtras={() => despachar({ tipo: 'atras' })} deshabilitado={s.ocupado} />
          : <span className="h-11 w-11 shrink-0" aria-hidden="true" />}
        <BarraDeAvance valor={avance(s.paso)} />
      </div>
      <div key={s.paso} className={cn('flex flex-1 flex-col justify-center py-2', s.animar && 'encuesta-entra')}>
        {pantalla}
      </div>
      {s.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{s.error}</p>}
    </div>
  )
}

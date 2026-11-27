'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast, type ExternalToast } from 'sonner'
import { ContactEditor } from '@/components/contacts/ContactEditor'
import {
  armarAviso,
  DESCRIPCION_TOAST_PERDIDO,
  textoToastPerdido,
  type AccionAviso,
  type Aviso,
} from '@/lib/crm/aviso-guardado'
import { MENSAJE_NO_SE_PUEDE_DESHACER } from '@/lib/crm/deshacer-perdido'
import { leerJson } from '@/lib/crm/leer-json'
import type { ActividadDeFicha } from '@/lib/crm/tipos'
import { Actividad } from './Actividad'
import { AvisoGuardado } from './AvisoGuardado'
import { BloqueLista } from './BloqueLista'
import { BotonMas } from './BotonMas'
import { Composer, type PestanaComposer } from './Composer'
import { ContactoNoEncontrado } from './Pantallas'
import { FichaCabecera } from './FichaCabecera'
import { FichaDatos } from './FichaDatos'
import { FichaPestanas, type PestanaFicha } from './FichaPestanas'
import type { TipoGuardado } from './FormLlamada'
import type { RespuestaGuardado } from './guardar-actividad'
import { HojaAgregar } from './HojaAgregar'
import { LateralTareas } from './LateralTareas'
import { useFicha } from './use-ficha'

// La ficha de un contacto (design.md D5 y D6). Recibe SOLO datos planos del servidor
// (`page.tsx`): ningún ícono, componente ni función cruza esa frontera (si cruza, la
// pantalla queda en blanco y ningún test lo detecta). Pide persona, actividad y tareas
// por separado (`useFicha`) y orquesta lo que pasa al guardar, deshacer y cerrar.

type Origen = 'composer' | 'hoja'

// Toasts con "Deshacer": 6 segundos (como la maqueta) y el botón de 44 px en táctil, con
// una clase propia en ESTOS toasts; el `Toaster` global no se toca (D5).
const TOAST_DESHACER: Pick<ExternalToast, 'duration' | 'classNames'> = {
  duration: 6000,
  classNames: { actionButton: '!min-h-11 raton:!min-h-8 !px-3 !text-[13px] !font-semibold' },
}

export function FichaContacto({
  contactoId,
  rol,
  usuarioId,
  abrirEditor,
  volver = null,
  reloj = () => new Date(),
}: {
  contactoId: string
  rol: string
  usuarioId: string
  abrirEditor: boolean
  /** El "‹ Volver" a la lista de origen, ya validado por `enlaceVolver` en la página (dato plano). */
  volver?: { href: string; texto: string } | null
  /** Solo para las pruebas; `page.tsx` no lo pasa (una función no cruza del servidor). */
  reloj?: () => Date
}) {
  const f = useFicha(contactoId)
  const { ficha, actividad, tareas } = f
  const [pestana, setPestana] = useState<PestanaFicha>('actividad')
  const [composer, setComposer] = useState<PestanaComposer>('nota')
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [editorAbierto, setEditorAbierto] = useState(abrirEditor)
  const [aviso, setAviso] = useState<{ aviso: Aviso; actividadId: string; dealId: string | null } | null>(null)
  const [nuevoId, setNuevoId] = useState<string | null>(null)
  const [enfocar, setEnfocar] = useState<'aviso' | 'nuevo' | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [ahora, setAhora] = useState(() => reloj())
  const refAviso = useRef<HTMLDivElement>(null)
  const refNuevo = useRef<HTMLLIElement>(null)
  const refNotaComposer = useRef<HTMLTextAreaElement>(null)
  const refNoAtendioComposer = useRef<HTMLButtonElement>(null)
  const toastId = useRef<string | number | null>(null)
  const relojRef = useRef(reloj)
  useEffect(() => {
    relojRef.current = reloj
  }, [reloj])

  // `rol` y `usuarioId` llegan del servidor para lo que la pantalla decide sola; los
  // permisos de cada acción los vuelve a mirar el servidor (`puede_editar`, `puede_convertir`).
  void rol
  void usuarioId

  useEffect(() => {
    const t = setInterval(() => setAhora(relojRef.current()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Un solo toast de la ficha a la vez (GUIA.md, D5): se cierra el anterior antes de
  // mostrar otro, al salir de la ficha y al abrir la hoja "+". Cerrarlo no deshace nada.
  const cerrarToast = useCallback(() => {
    if (toastId.current !== null) toast.dismiss(toastId.current)
    toastId.current = null
  }, [])
  const mostrarToast = useCallback(
    (texto: string, opciones?: ExternalToast, error = false) => {
      cerrarToast()
      toastId.current = error ? toast.error(texto, opciones) : toast(texto, opciones)
    },
    [cerrarToast],
  )
  useEffect(() => () => cerrarToast(), [cerrarToast])
  const avisar = useCallback((texto: string, error = false) => mostrarToast(texto, undefined, error), [mostrarToast])

  // Foco después de guardar en las vistas con columnas: al aviso de lo que pasó o, si no
  // hay aviso (una nota), al registro nuevo (GUIA.md §11).
  useEffect(() => {
    if (!enfocar) return
    const el = enfocar === 'aviso' ? refAviso.current : refNuevo.current
    if (el) {
      el.focus({ preventScroll: true })
      setEnfocar(null)
    }
  }, [enfocar, aviso, actividad.items])

  const nombre = ficha.datos?.persona.full_name ?? ''

  const despuesDeGuardar = (origen: Origen) => {
    setAhora(reloj())
    if (origen === 'composer') {
      setComposer('nota')
    } else {
      setHojaAbierta(false)
      setPestana('actividad')
      const cont = document.getElementById('contenido')
      if (cont) cont.scrollTop = 0
    }
  }

  const ponerPrimero = (a: ActividadDeFicha) => {
    setNuevoId(a.id)
    if (actividad.filtro === 'todo') f.cambiarActividad((items) => [a, ...items.filter((x) => x.id !== a.id)])
    void f.recargarActividad('todo')
  }

  const anular = async (a: ActividadDeFicha, desdeToast: boolean): Promise<boolean> => {
    try {
      const r = await leerJson<{ ok: boolean }>(
        await fetch(`/api/contacts/${encodeURIComponent(contactoId)}/activities/${encodeURIComponent(a.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'anular' }),
        }),
      )
      if (!r.ok && r.data?.code === 'ANULADA_SIN_TAREAS') {
        // El registro YA quedó anulado; lo que falló es deshacer sus tareas (revisión 12.1).
        // Sale de la lista igual, y "Reintentar" repite solo la parte de las tareas (D8).
        sacarAnulada(a)
        mostrarToast(r.error, { action: { label: 'Reintentar', onClick: () => void anular(a, desdeToast) } }, true)
        return true
      }
      if (!r.ok) {
        // Anular se puede repetir (D8): se ofrece reintentar.
        mostrarToast(r.error, { action: { label: 'Reintentar', onClick: () => void anular(a, desdeToast) } }, true)
        return false
      }
    } catch (err) {
      console.error('[ficha] no se pudo anular', err)
      mostrarToast('No se pudo deshacer. Probá de nuevo.', { action: { label: 'Reintentar', onClick: () => void anular(a, desdeToast) } }, true)
      return false
    }
    sacarAnulada(a)
    mostrarToast(desdeToast ? 'Listo, se deshizo.' : a.kind === 'note' ? 'Nota borrada.' : 'Registro anulado.')
    return true
  }

  /** Saca de la pantalla un registro ya anulado y vuelve a pedir lo que pudo cambiar. */
  function sacarAnulada(a: ActividadDeFicha) {
    f.cambiarActividad((items) => items.filter((x) => x.id !== a.id))
    setAviso((v) => (v?.actividadId === a.id ? null : v))
    void f.recargarActividad()
    if (a.kind !== 'note') {
      void f.recargarTareas()
      void f.recargarFicha()
    }
  }

  const alGuardarNota = (origen: Origen) => (r: RespuestaGuardado) => {
    ponerPrimero(r.actividad)
    despuesDeGuardar(origen)
    if (origen === 'composer') setEnfocar('nuevo')
    mostrarToast('Nota guardada.', {
      ...TOAST_DESHACER,
      action: { label: 'Deshacer', onClick: () => void anular(r.actividad, true) },
    })
  }

  const mostrarAvisoDe = (r: RespuestaGuardado, tipo: TipoGuardado) => {
    if (!r.cadencia) return null
    const a = armarAviso({
      tipo,
      titulo: r.actividad.titulo,
      intento: r.actividad.intento,
      resultado: r.actividad.call_outcome,
      cadencia: r.cadencia,
      pendiente: r.pendiente,
      contactoId,
      nombreContacto: nombre,
      etiquetaEtapa: ficha.datos?.procesoActivo?.etiquetaEtapa ?? null,
      ahora: reloj(),
    })
    setAviso({ aviso: a, actividadId: r.actividad.id, dealId: r.cadencia.dealId })
    return a
  }

  const alGuardarLlamada = (origen: Origen) => (r: RespuestaGuardado, tipo: TipoGuardado) => {
    ponerPrimero(r.actividad)
    // La llamada cierra y crea tareas y cambia el "Último contacto": se piden de nuevo.
    void f.recargarTareas()
    void f.recargarFicha()
    const a = mostrarAvisoDe(r, tipo)
    despuesDeGuardar(origen)
    if (origen === 'composer') setEnfocar('aviso')
    mostrarToast(a?.toast ?? r.actividad.titulo, {
      ...TOAST_DESHACER,
      action: { label: 'Deshacer', onClick: () => void anular(r.actividad, true) },
    })
  }

  const deshacerPerdido = async (dealId: string): Promise<boolean> => {
    try {
      const r = await leerJson<{ ok: boolean }>(await fetch(`/api/deals/${encodeURIComponent(dealId)}/undo-lost`, { method: 'POST' }))
      if (r.ok) {
        void f.recargarFicha()
        mostrarToast('Listo, se deshizo.')
        return true
      }
      if (r.status === 409) {
        mostrarToast(r.error || MENSAJE_NO_SE_PUEDE_DESHACER, undefined, true)
        void f.recargarFicha()
        return false
      }
      mostrarToast(r.error, undefined, true)
      return true
    } catch (err) {
      console.error('[ficha] no se pudo deshacer el perdido', err)
      mostrarToast('No se pudo deshacer. Probá de nuevo.', undefined, true)
      return true
    }
  }

  const marcarPerdido = async (dealId: string) => {
    if (ocupado) return
    setOcupado(true)
    const teniaTasacion = !!ficha.datos?.tasacionesAgendadas.some((t) => t.dealId === dealId)
    try {
      const r = await leerJson<{ success: boolean }>(
        await fetch(`/api/deals/${encodeURIComponent(dealId)}/advance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: 'lost' }),
        }),
      )
      if (!r.ok) {
        // Hoy `/pipeline/[id]` falla en silencio; acá se dice y el aviso queda como estaba.
        mostrarToast(`No se pudo marcar el proceso como perdido: ${r.error}`, undefined, true)
        return
      }
      setAviso(null)
      void f.recargarFicha()
      mostrarToast(textoToastPerdido(teniaTasacion), {
        ...TOAST_DESHACER,
        description: DESCRIPCION_TOAST_PERDIDO,
        action: { label: 'Deshacer', onClick: () => void deshacerPerdido(dealId) },
      })
    } catch (err) {
      console.error('[ficha] no se pudo marcar el proceso como perdido', err)
      mostrarToast('No se pudo marcar el proceso como perdido. Probá de nuevo.', undefined, true)
    } finally {
      setOcupado(false)
    }
  }

  const reintentarCadencia = async () => {
    if (!aviso || ocupado) return
    setOcupado(true)
    try {
      const r = await leerJson<RespuestaGuardado>(
        await fetch(
          `/api/contacts/${encodeURIComponent(contactoId)}/activities/${encodeURIComponent(aviso.actividadId)}/cadencia`,
          { method: 'POST' },
        ),
      )
      if (!r.ok) {
        mostrarToast(r.error, undefined, true)
        return
      }
      mostrarAvisoDe(r.data, r.data.actividad.kind === 'whatsapp_sent' ? 'whatsapp_sent' : 'call')
      void f.recargarTareas()
      void f.recargarActividad()
    } catch (err) {
      // Red cortada: sin este catch la promesa quedaba rechazada sin que nadie se enterara
      // y el botón parecía no hacer nada (revisión 12.1). El aviso sigue con "Reintentar".
      console.error('[ficha] no se pudo reintentar la cadencia', err)
      mostrarToast('No se pudo agendar la siguiente. Revisá la conexión y probá de nuevo.', undefined, true)
    } finally {
      setOcupado(false)
    }
  }

  const alAccion = (a: AccionAviso) => {
    switch (a.tipo) {
      case 'perdido':
        void marcarPerdido(a.dealId)
        break
      case 'dejar_abierto':
        setAviso(null)
        break
      case 'reintentar':
        void reintentarCadencia()
        break
      case 'ver_tareas':
        setPestana('tareas')
        break
      default:
        break // coordinar y abrir son enlaces
    }
  }

  const [vistaHoja, setVistaHoja] = useState<'menu' | 'llamada' | 'nota'>('menu')
  const abrirHoja = (vista: 'menu' | 'llamada' | 'nota') => {
    cerrarToast()
    setVistaHoja(vista)
    setHojaAbierta(true)
  }
  /** Abre el formulario: en columnas, la pestaña del cuadro; en una columna, la hoja. */
  const abrirFormulario = (cual: 'llamada' | 'nota') => {
    const cuadro = document.getElementById('ficha-composer')
    const hayColumnas = !!cuadro && getComputedStyle(cuadro).display !== 'none'
    if (!hayColumnas) return abrirHoja(cual)
    setComposer(cual)
    requestAnimationFrame(() => {
      cuadro.scrollIntoView?.({ block: 'start' })
      ;(cual === 'nota' ? refNotaComposer.current : refNoAtendioComposer.current)?.focus({ preventScroll: true })
    })
  }

  if (ficha.noEncontrado) return <ContactoNoEncontrado />

  const datos = ficha.datos
  return (
    <div className="ficha" data-ficha={contactoId}>
      <div className="ficha-grilla">
        <FichaCabecera
          estado={ficha.estado}
          ficha={datos}
          volver={volver}
          onReintentar={() => void f.recargarFicha()}
          pestanas={
            <FichaPestanas
              activa={pestana}
              onCambiar={setPestana}
              numeroTareas={tareas.estado === 'ok' ? tareas.tareas.length : null}
            />
          }
        />

        <div
          id="ficha-p-datos"
          role="tabpanel"
          aria-labelledby="ficha-tab-datos"
          aria-label="Datos de la persona"
          data-activa={pestana === 'datos'}
          className="ficha-panel ficha-persona"
        >
          <FichaDatos
            estado={ficha.estado}
            ficha={datos}
            contactoId={contactoId}
            onReintentar={() => void f.recargarFicha()}
            onEditarContacto={() => setEditorAbierto(true)}
            onBackgroundGuardado={() => void f.recargarFicha()}
            avisar={avisar}
          />
        </div>

        <div
          id="ficha-p-actividad"
          role="tabpanel"
          aria-labelledby="ficha-tab-actividad"
          aria-label="Actividad"
          data-activa={pestana === 'actividad'}
          className="ficha-panel ficha-centro"
        >
          <Composer
            contactoId={contactoId}
            pestana={composer}
            onPestana={setComposer}
            onNotaGuardada={alGuardarNota('composer')}
            onLlamadaGuardada={alGuardarLlamada('composer')}
            refNota={refNotaComposer}
            refNoAtendio={refNoAtendioComposer}
            reloj={reloj}
          />
          <div aria-live="polite">
            {aviso && (
              <AvisoGuardado
                ref={refAviso}
                aviso={aviso.aviso}
                ocupado={ocupado}
                onAccion={alAccion}
                onCerrar={() => setAviso(null)}
              />
            )}
          </div>
          <Actividad
            bloque={actividad}
            contactoId={contactoId}
            ahora={ahora}
            nuevoId={nuevoId}
            refNuevo={refNuevo}
            onFiltrar={(fl) => void f.recargarActividad(fl)}
            onReintentar={() => void f.recargarActividad()}
            onVerMas={f.verMas}
            onEditada={(a) => f.cambiarActividad((items) => items.map((x) => (x.id === a.id ? a : x)))}
            onAnular={(a) => anular(a, false)}
            onAbrirLlamada={() => abrirFormulario('llamada')}
            onAbrirNota={() => abrirFormulario('nota')}
          />
        </div>

        <div
          id="ficha-p-tareas"
          role="tabpanel"
          aria-labelledby="ficha-tab-tareas"
          aria-label="Tareas, tasaciones y procesos"
          data-activa={pestana === 'tareas'}
          className="ficha-panel ficha-lado"
        >
          <LateralTareas
            contactoId={contactoId}
            nombre={datos?.persona.full_name ?? null}
            estado={tareas.estado}
            tareas={tareas.tareas}
            ahora={ahora}
            onReintentar={() => void f.recargarTareas()}
            onCreada={() => void f.recargarTareas()}
            onCompletada={(id) => f.cambiarTareas((ts) => ts.filter((t) => t.id !== id))}
            avisar={avisar}
          />
          {datos && <BloqueLista ficha={datos} ahora={ahora} onDeshacerPerdido={deshacerPerdido} />}
        </div>
      </div>

      <BotonMas onClick={() => abrirHoja('menu')} />
      <HojaAgregar
        abierta={hojaAbierta}
        vistaAlAbrir={vistaHoja}
        onAbierta={(a) => (a ? abrirHoja('menu') : setHojaAbierta(false))}
        contactoId={contactoId}
        onNotaGuardada={alGuardarNota('hoja')}
        onLlamadaGuardada={alGuardarLlamada('hoja')}
        reloj={reloj}
      />
      <ContactEditor
        open={editorAbierto}
        onOpenChange={setEditorAbierto}
        contactId={contactoId}
        onSaved={() => void f.recargarFicha()}
      />
    </div>
  )
}

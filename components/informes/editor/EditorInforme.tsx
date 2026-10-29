'use client'
/**
 * Pantalla del informe quincenal (spec, "Qué ve cada persona"): lo que juntó la plataforma a la
 * vista, lo que carga Paula (números y capturas de los portales sin API, competidoras, información
 * escrita), lo que falta en naranja, vista previa del PDF y "Marcar como listo".
 *
 * Reglas que sostienen la pantalla:
 * - Las fuentes automáticas se piden DE A UNA (regla dura de Netlify) y se muestra el avance.
 * - Los guardados van EN FILA (`cola`): el servidor reemplaza `manual` entero, así que dos PATCH
 *   cruzados podían pisar un número recién cargado; y antes de armar el PDF se espera la fila y se
 *   relee el informe, para que no salga con un dato escrito un segundo antes.
 * - Un solo render de react-pdf a la vez (`armandoPdf`): dos en paralelo se corrompen (CLAUDE.md,
 *   gotcha del PDFViewer de tasaciones). Por eso la vista previa es un blob en un iframe.
 * - AUTOGUARDADO (pedido del dueño, 2026-10-24): los campos guardan a la pausa al tipear; un guardado que falla
 *   por el camino (red, servidor) NO vuelve atrás: lo escrito queda y se reintenta solo; al cerrar o recargar la
 *   pestaña se manda lo pendiente con `keepalive` y el navegador avisa. La barra de abajo dice siempre si quedó
 *   guardado. Las reglas viven en lib/informes/autoguardado.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Download, Eye, Loader2, Pencil, RefreshCw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { sanearCambios } from '@/lib/informes/sanear'
import { esReintentable, esperaParaReintento, estadoDelGuardado, mezclarTrasEscribir } from '@/lib/informes/autoguardado'
import { hayAjustes, textosDesactualizados } from '@/lib/informes/ajustes'
import type { CampoTexto as CampoDeTexto } from '@/lib/informes/redaccion'
import { fuentesPorTraer, resumenDeLaFuente, rotuloDeLaFuente, type Tono } from '@/lib/informes/editor'
import { textoDelPeriodo } from '@/lib/informes/periodo'
import type { VistaInforme } from '@/lib/informes/servicio'
import { FUENTES, type Ajustes, type Competidora, type Manual, type NombreFuente } from '@/lib/informes/tipos'
import { cn } from '@/lib/utils'
import { generarPdfDelInforme } from '../pdf/generar'
import * as api from './api'
import { CampoLinea, CampoNumero, CampoTexto, Publicada, Seccion, type AvisarPendiente } from './campos'
import { CapturaPortal } from './CapturaPortal'
import { AjusteDeFuente } from './AjusteDeFuente'
import { Competidoras } from './Competidoras'

const NOMBRE_FUENTE: Record<NombreFuente, string> = {
  consultas: 'Consultas por portal', visitas: 'Visitas y ficha de visitas', reserva: 'Reserva',
  mercadolibre: 'Visitas al aviso de MercadoLibre', meta: 'Campaña de Meta Ads', instagram: 'Reels de Instagram',
}

const TONO: Record<Tono, string> = {
  pendiente: 'bg-muted text-muted-foreground', ok: 'bg-emerald-100 text-emerald-800',
  neutro: 'bg-slate-100 text-slate-700', error: 'bg-red-100 text-red-800',
}

type Fase = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'lista'; vista: VistaInforme }

export function EditorInforme({ informeId }: { informeId: string }) {
  const [fase, setFase] = useState<Fase>({ tipo: 'cargando' })
  const [manual, setManual] = useState<Manual | null>(null)
  const [trayendo, setTrayendo] = useState<NombreFuente | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [armandoPdf, setArmandoPdf] = useState<'previa' | 'listo' | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(0)
  const [escribiendo, setEscribiendo] = useState(false)
  const [progresoCompetencia, setProgresoCompetencia] = useState<string | null>(null)
  const manualRef = useRef<Manual | null>(null)
  /** Lo último que el servidor aceptó: adonde se vuelve si un guardado falla. */
  const confirmado = useRef<Manual>({})
  const cola = useRef<Promise<void>>(Promise.resolve())
  const yaTrajo = useRef(false)
  /** Un guardado que falló por el camino y se está reintentando: mientras tanto NO se puede decir "guardado". */
  const [fallo, setFallo] = useState<string | null>(null)
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null)
  /** Campos con algo escrito que todavía no se mandó (la pausa al tipear no se cumplió). */
  const pendientes = useRef(new Map<string, () => void>())
  const [nPendientes, setNPendientes] = useState(0)
  const reintento = useRef<{ timer: ReturnType<typeof setTimeout> | null; intento: number }>({ timer: null, intento: 0 })
  /** Lista de competidoras que todavía no entró a la base (se reintenta igual que `manual`). */
  const competidorasSinGuardar = useRef<Competidora[] | null>(null)
  /** Lo que había que hacer después de un guardado que falló (traer de nuevo ML): corre cuando el reintento entra. */
  const despuesPendiente = useRef<(() => Promise<void>) | null>(null)
  const desmontado = useRef(false)
  /** Sube cuando un guardado se RECHAZA y se vuelve atrás: los campos se re-montan y muestran lo que sí quedó. */
  const [versionCampos, setVersionCampos] = useState(0)
  // `escribir` se declara antes que `enviarManual`: lo llama por acá.
  const enviarRef = useRef<() => Promise<boolean>>(async () => true)

  const onPendiente = useCallback<AvisarPendiente>((id, enviar) => {
    if (enviar) pendientes.current.set(id, enviar)
    else pendientes.current.delete(id)
    setNPendientes(pendientes.current.size)
  }, [])

  const recargar = useCallback(async () => {
    const vista = await api.leerVista(informeId)
    setFase({ tipo: 'lista', vista })
    return vista
  }, [informeId])

  /** Encola un guardado; los errores se muestran y no cortan la fila. */
  const encolar = useCallback((trabajo: () => Promise<void>) => {
    setGuardando(n => n + 1)
    cola.current = cola.current.then(trabajo).catch(e => {
      setAviso(e instanceof Error ? e.message : 'No se pudo guardar. Probá de nuevo.')
    }).finally(() => setGuardando(n => n - 1))
    return cola.current
  }, [])

  /**
   * La plataforma escribe los textos (una llamada al modelo, en la fila de guardados para no cruzarse con un
   * PATCH de `manual`). Al volver, la pantalla toma el `manual` del servidor: ahí están los textos nuevos.
   */
  const escribir = useCallback((forzar: boolean) => {
    // Lo escrito sin mandar entra a la cola ANTES: la plataforma escribe sobre lo último que cargó Paula.
    for (const enviar of [...pendientes.current.values()]) enviar()
    setEscribiendo(true)
    setAviso(null)
    void encolar(async () => {
      const antes = confirmado.current
      const r = await api.escribirTextos(informeId, forzar)
      // Antes se adoptaba lo del servidor y lo cargado mientras escribía se perdía (revisión adversarial).
      const mezcla = mezclarTrasEscribir({ local: manualRef.current ?? {}, confirmadoAntes: antes, servidor: r.manual })
      confirmado.current = r.manual
      manualRef.current = mezcla.manual
      setManual(mezcla.manual)
      // Lo que escribió la plataforma ya quedó en la base (si además hubo que mandar lo de Paula, `enviarManual` lo marca).
      if (mezcla.hayQueMandar) await enviarRef.current()
      else setGuardadoEn(new Date())
      await recargar()
    }).finally(() => setEscribiendo(false))
  }, [encolar, informeId, recargar])

  /**
   * Busca competidoras: Argenprop y MercadoLibre de a uno (un portal por pedido), y después abre las 6 mejores de a
   * una para leer disposición y estado (~1 crédito de ScraperAPI cada página). Un fallo no corta el resto.
   */
  const buscarCompetidoras = useCallback(async () => {
    try {
      for (const [portal, nombre] of [['argenprop', 'Argenprop'], ['mercadolibre', 'MercadoLibre']] as const) {
        setProgresoCompetencia(`Buscando en ${nombre}…`)
        // Un reintento: el listado de Argenprop a veces llega distinto y al rato anda (vista previa, 2026-10-22). Va en
        // otro pedido, así no se suman dos esperas dentro del techo de Netlify.
        for (let intento = 0; intento < 2; intento++) {
          try {
            if ((await api.buscarCompetencia(informeId, portal)).estado !== 'error') break
          } catch { /* queda como error del portal; se ve y se puede buscar de nuevo */ }
        }
      }
      const vista = await recargar()
      const porAbrir = vista.candidatas.filter(c => !c.abierta).slice(0, 6)
      for (const [n, c] of porAbrir.entries()) {
        setProgresoCompetencia(`Revisando los avisos (${n + 1} de ${porAbrir.length})…`)
        try { await api.abrirCandidata(informeId, c.url) } catch { /* sin disposición/estado: la candidata igual queda */ }
      }
      await recargar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudieron buscar competidoras')
    } finally {
      setProgresoCompetencia(null)
    }
  }, [informeId, recargar])

  // Primera carga + traer las fuentes pendientes de a una.
  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        const vista = await api.leerVista(informeId)
        if (!vigente) return
        manualRef.current = vista.informe.manual
        confirmado.current = vista.informe.manual
        setManual(vista.informe.manual)
        setFase({ tipo: 'lista', vista })
        if (vista.informe.estado !== 'borrador' || yaTrajo.current) return
        yaTrajo.current = true
        for (const nombre of fuentesPorTraer(vista.informe.fuentesAutomaticas ?? vista.informe.fuentes)) {
          if (!vigente) return
          setTrayendo(nombre)
          try { await api.traerFuente(informeId, nombre) } catch { /* queda pendiente: se ve y se reintenta */ }
        }
        if (!vigente) return
        setTrayendo(null)
        const fresca = await recargar()
        if (vigente && debeEscribirSolo(fresca)) escribir(false)
        if (vigente && !fresca.informe.candidatas.argenprop && !fresca.informe.candidatas.mercadolibre) void buscarCompetidoras()
      } catch (e) {
        if (vigente) setFase({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'No pudimos abrir el informe' })
      }
    })()
    return () => { vigente = false }
  }, [informeId, recargar, escribir, buscarCompetidoras])

  function reintentar(nombre: NombreFuente) {
    setTrayendo(nombre)
    void encolar(async () => {
      await api.traerFuente(informeId, nombre)
      await recargar()
    }).finally(() => setTrayendo(null))
  }

  /**
   * Manda el `manual` ACTUAL (no el de cuando se pidió: si en el medio se escribió algo más, va también).
   * Devuelve si entró. Un fallo del camino deja lo escrito y programa un reintento; un rechazo del dato vuelve a
   * lo último confirmado y lo dice.
   */
  const enviarManual = useCallback(async (): Promise<boolean> => {
    const enviado = manualRef.current ?? {}
    try {
      await api.guardarManual(informeId, enviado)
    } catch (e) {
      if (e instanceof api.ErrorDePedido && esReintentable(e.status)) {
        programarReintento.current(e.message)
        return false
      }
      manualRef.current = confirmado.current
      setManual(confirmado.current)
      setFallo(null)
      setGuardadoEn(null)
      setVersionCampos(v => v + 1)
      throw e
    }
    confirmado.current = enviado
    if (reintento.current.timer) { clearTimeout(reintento.current.timer); reintento.current.timer = null }
    reintento.current.intento = 0
    setFallo(null)
    setGuardadoEn(new Date())
    return true
  }, [informeId])
  useEffect(() => { enviarRef.current = enviarManual }, [enviarManual])

  /** Igual que `enviarManual`, para la lista de competidoras (el servidor también la reemplaza entera). */
  const enviarCompetidoras = useCallback(async (): Promise<boolean> => {
    const lista = competidorasSinGuardar.current
    if (!lista) return true
    try {
      await api.guardarCompetidoras(informeId, lista)
    } catch (e) {
      if (e instanceof api.ErrorDePedido && esReintentable(e.status)) {
        programarReintento.current(e.message)
        return false
      }
      competidorasSinGuardar.current = null
      throw e
    }
    if (competidorasSinGuardar.current === lista) competidorasSinGuardar.current = null
    setGuardadoEn(new Date())
    return true
  }, [informeId])

  // En una ref: `enviarManual` y el reintento se llaman entre sí.
  const programarReintento = useRef<(motivo: string) => void>(() => {})
  useEffect(() => {
    programarReintento.current = (motivo: string) => {
      if (desmontado.current) return
      setFallo(motivo)
      if (reintento.current.timer) return
      reintento.current.timer = setTimeout(() => {
        reintento.current.timer = null
        reintento.current.intento++
        void encolar(async () => {
          const manualOk = manualRef.current === confirmado.current || await enviarManual()
          const listaOk = await enviarCompetidoras()
          if (!manualOk || !listaOk) return
          const despues = despuesPendiente.current
          despuesPendiente.current = null
          if (despues) await despues()
          await recargar()
        })
      }, esperaParaReintento(reintento.current.intento))
    }
  }, [encolar, enviarManual, enviarCompetidoras, recargar])

  // Cerrar o recargar la pestaña con algo sin guardar: se manda igual (keepalive) y el navegador avisa antes.
  useEffect(() => {
    desmontado.current = false
    const reintentoActual = reintento.current
    const sinGuardar = () => pendientes.current.size > 0 || manualRef.current !== confirmado.current || competidorasSinGuardar.current !== null
    const antesDeSalir = (e: BeforeUnloadEvent) => {
      if (!sinGuardar()) return
      e.preventDefault()
      e.returnValue = ''
    }
    const mandarTodoYa = () => {
      // Pasa lo escrito sin mandar a la memoria (cada `enviar` lo aplica) y lo manda de una con keepalive.
      for (const enviar of [...pendientes.current.values()]) enviar()
      const manual = manualRef.current && manualRef.current !== confirmado.current ? manualRef.current : undefined
      const competidoras = competidorasSinGuardar.current ?? undefined
      if (manual || competidoras) api.guardarAlSalir(informeId, { manual, competidoras })
    }
    // En el celular, cambiar de app puede matar la pestaña sin `pagehide`: la señal confiable es `hidden`.
    const alCambiarVisibilidad = () => { if (document.visibilityState === 'hidden') mandarTodoYa() }
    window.addEventListener('beforeunload', antesDeSalir)
    window.addEventListener('pagehide', mandarTodoYa)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      window.removeEventListener('beforeunload', antesDeSalir)
      window.removeEventListener('pagehide', mandarTodoYa)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      // Salir a otra pantalla de la plataforma (no dispara `pagehide`): lo pendiente sale igual y no quedan reintentos
      // corriendo en una pantalla que ya no está.
      desmontado.current = true
      if (reintentoActual.timer) { clearTimeout(reintentoActual.timer); reintentoActual.timer = null }
      mandarTodoYa()
    }
  }, [informeId])

  /**
   * El servidor reemplaza `manual` ENTERO, así que un dato inválido aplicado en pantalla viajaría en
   * cada guardado siguiente y los haría fallar a todos (revisión adversarial): se valida ANTES con la
   * misma regla del servidor y, si igual lo rechaza, la pantalla vuelve a lo último confirmado.
   */
  function guardarManual(cambio: (m: Manual) => Manual, despues?: () => Promise<void>) {
    const siguiente = cambio(manualRef.current ?? {})
    const validado = sanearCambios({ manual: siguiente })
    if (!validado.ok) { setAviso(validado.error); return }
    manualRef.current = siguiente
    setManual(siguiente)
    setAviso(null)
    void encolar(async () => {
      if (!(await enviarManual())) {
        if (despues) despuesPendiente.current = despues
        return
      }
      if (despues) await despues()
      await recargar()
    })
  }

  /** Un campo de "Corregir a mano". Vacío = ese dato vuelve a lo automático. */
  function ajustar(fuente: NombreFuente, campo: string, valor: number | boolean | string | null | undefined) {
    guardarManual(x => {
      const actual: Record<string, unknown> = { ...(x.ajustes?.[fuente] ?? {}) }
      if (valor === undefined || valor === null || valor === '') delete actual[campo]
      else actual[campo] = valor
      const ajustes: Ajustes = { ...x.ajustes, [fuente]: actual }
      return { ...x, ajustes, ajustesEn: new Date().toISOString() }
    })
  }

  function volverAlAutomatico(fuente: NombreFuente) {
    guardarManual(x => {
      const ajustes: Ajustes = { ...x.ajustes }
      delete ajustes[fuente]
      return { ...x, ajustes, ajustesEn: new Date().toISOString() }
    })
    // Los campos guardan lo tipeado en su estado: se re-montan para mostrar lo automático.
    setVersionCampos(v => v + 1)
  }

  async function guardarCompetidoras(lista: Competidora[]) {
    competidorasSinGuardar.current = lista
    setAviso(null)
    await encolar(async () => {
      if (await enviarCompetidoras()) await recargar()
    })
  }

  /** Espera los guardados en curso y relee el informe: el PDF sale con lo último que se escribió. */
  async function armarPdf(): Promise<{ blob: Blob; vista: VistaInforme }> {
    await cola.current
    const vista = await recargar()
    return { blob: await generarPdfDelInforme(vista), vista }
  }

  async function verPrevia() {
    setArmandoPdf('previa')
    setAviso(null)
    try {
      const { blob } = await armarPdf()
      setPrevia(URL.createObjectURL(blob))
    } catch (e) {
      setAviso(e instanceof Error ? `No se pudo armar la vista previa: ${e.message}` : 'No se pudo armar la vista previa')
    } finally {
      setArmandoPdf(null)
    }
  }

  async function marcarListo() {
    setArmandoPdf('listo')
    setAviso(null)
    try {
      const { blob, vista } = await armarPdf()
      if (vista.faltantes.length) { setAviso(`Falta completar: ${vista.faltantes.join(', ')}`); return }
      await api.subirPdfYMarcarListo(informeId, blob, vista.informe.updatedAt)
      await recargar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo marcar como listo')
    } finally {
      setArmandoPdf(null)
    }
  }

  async function aBorrador() {
    setAviso(null)
    try {
      await api.volverABorrador(informeId)
      await recargar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo volver a borrador')
    }
  }

  function cerrarPrevia() {
    if (previa) URL.revokeObjectURL(previa)
    setPrevia(null)
  }

  if (fase.tipo === 'cargando') return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
  if (fase.tipo === 'error') {
    return (
      <div className="space-y-4">
        <Volver />
        <p role="alert" className="text-sm">{fase.mensaje}</p>
      </div>
    )
  }

  const { vista } = fase
  const { informe, propiedad, resumen, faltantes, capturasUrl } = vista
  const listo = informe.estado === 'listo'
  const m = manual ?? informe.manual
  // Los rótulos de `faltantes()` llevan aclaraciones ("… (o marcar que no está publicada)"): se compara el comienzo.
  const falta = (...comienzos: string[]) => !listo && faltantes.some(x => comienzos.some(c => x.startsWith(c)))
  // La búsqueda de competidoras escribe el informe (cambia su versión): marcarlo listo en el medio daría 409.
  // Con algo sin guardar (pendiente o reintentando) tampoco: el PDF saldría sin eso.
  const ocupado = armandoPdf !== null || guardando > 0 || progresoCompetencia !== null || fallo !== null || nPendientes > 0
  // Mientras se arma el PDF no se edita: lo escrito en ese momento no saldría en el PDF.
  const bloqueado = listo || armandoPdf !== null || escribiendo
  // Un texto escrito por la plataforma con un número que no está en los datos, que nadie corrigió todavía.
  const aRevisar = (c: CampoDeTexto) => !listo && !!m.redaccion?.revisar.includes(c)
    && (m.textos?.[c] ?? '').trim() === (m.redaccion?.original[c] ?? '').trim()
  const claveTexto = (c: CampoDeTexto) => `${c}-${m.redaccion?.generadoEn ?? ''}-${versionCampos}`

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-28">
      <Volver propertyId={informe.propertyId} />
      <header className="space-y-1">
        <p className="eyebrow">Informe quincenal</p>
        <h1 className="display text-2xl">{propiedad.direccion}</h1>
        <p className="text-sm text-muted-foreground">Período {textoDelPeriodo(informe.desde, informe.hasta)}</p>
        <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', listo ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')}>
          {listo ? 'Listo' : 'Para completar'}
        </span>
      </header>

      {listo ? (
        <div className="flex flex-wrap gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="w-full text-sm">El informe está listo. Para corregirlo, volvelo a borrador.</p>
          {vista.pdfUrl ? (
            <Button asChild className="min-h-11"><a href={vista.pdfUrl}><Download className="mr-1 h-4 w-4" aria-hidden /> Descargar PDF</a></Button>
          ) : null}
          <Button type="button" variant="outline" className="min-h-11" onClick={aBorrador}><Undo2 className="mr-1 h-4 w-4" aria-hidden /> Volver a borrador</Button>
        </div>
      ) : faltantes.length ? (
        <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
          <p className="font-medium">Falta completar para marcarlo como listo:</p>
          <ul className="mt-1 list-disc pl-5">{faltantes.map(f => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : null}

      {aviso ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{aviso}</p> : null}

      <Seccion id="sec-automatico" titulo="Lo que juntó la plataforma" ayuda="Se trae solo. Si algo no se pudo traer, el informe lo dice y no lo cuenta como cero.">
        <ul className="space-y-2">
          {FUENTES.map(n => (
            <FilaFuente key={n} nombre={n} vista={vista} trayendo={trayendo === n} deshabilitado={listo || trayendo !== null} onReintentar={() => reintentar(n)}
              ajustes={m.ajustes} bloqueado={bloqueado} onAjustar={(campo, v) => ajustar(n, campo, v)} onAutomatico={() => volverAlAutomatico(n)}
              onPendiente={onPendiente} version={versionCampos} />
          ))}
        </ul>
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p>Vieron la propiedad: <strong>{resumen.vieron.valor === null ? '—' : resumen.vieron.valor.toLocaleString('es-AR')}</strong>
            {resumen.vieron.faltan.length ? <span className="text-orange-700"> (falta {resumen.vieron.faltan.join(', ')})</span> : null}</p>
          <p>Entraron al aviso: <strong>{resumen.entraron.valor === null ? '—' : resumen.entraron.valor.toLocaleString('es-AR')}</strong>
            {resumen.entraron.faltan.length ? <span className="text-orange-700"> (falta {resumen.entraron.faltan.join(', ')})</span> : null}</p>
        </div>
      </Seccion>

      <Seccion id="sec-zonaprop" titulo="Zonaprop" ayuda="Copiá los números del panel de Zonaprop para este período.">
        <Publicada id="zp-publicado" portal="Zonaprop" publicado={m.zonaprop?.publicado} deshabilitado={bloqueado}
          onCambiar={v => guardarManual(x => ({ ...x, zonaprop: { ...x.zonaprop, publicado: v } }))} />
        {m.zonaprop?.publicado !== false ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CampoNumero key={`zp-exposicion-${versionCampos}`} id="zp-exposicion" alTipear onPendiente={onPendiente} etiqueta="Exposición (veces en los listados)" valor={m.zonaprop?.exposicion} deshabilitado={bloqueado}
                falta={falta('Zonaprop: exposición')} onGuardar={n => guardarManual(x => ({ ...x, zonaprop: { ...x.zonaprop, exposicion: n } }))} />
              <CampoNumero key={`zp-visualizaciones-${versionCampos}`} id="zp-visualizaciones" alTipear onPendiente={onPendiente} etiqueta="Visualizaciones (entraron al aviso)" valor={m.zonaprop?.visualizaciones} deshabilitado={bloqueado}
                falta={falta('Zonaprop: visualizaciones', 'Zonaprop: exposición y')} onGuardar={n => guardarManual(x => ({ ...x, zonaprop: { ...x.zonaprop, visualizaciones: n } }))} />
              <CampoNumero key={`zp-interesados-${versionCampos}`} id="zp-interesados" alTipear onPendiente={onPendiente} etiqueta="Interesados" valor={m.zonaprop?.interesados} deshabilitado={bloqueado}
                onGuardar={n => guardarManual(x => ({ ...x, zonaprop: { ...x.zonaprop, interesados: n } }))} />
            </div>
            <CapturaPortal informeId={informe.id} cual="zonaprop" portal="Zonaprop" url={capturasUrl.zonaprop} deshabilitado={bloqueado} onCambio={() => void recargar()} />
          </>
        ) : null}
      </Seccion>

      <Seccion id="sec-argenprop" titulo="Argenprop">
        <Publicada id="ap-publicado" portal="Argenprop" publicado={m.argenprop?.publicado} deshabilitado={bloqueado}
          onCambiar={v => guardarManual(x => ({ ...x, argenprop: { ...x.argenprop, publicado: v } }))} />
        {m.argenprop?.publicado !== false ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CampoNumero key={`ap-visualizaciones-${versionCampos}`} id="ap-visualizaciones" alTipear onPendiente={onPendiente} etiqueta="Visualizaciones" valor={m.argenprop?.visualizaciones} deshabilitado={bloqueado}
                falta={falta('Argenprop: visualizaciones')} onGuardar={n => guardarManual(x => ({ ...x, argenprop: { ...x.argenprop, visualizaciones: n } }))} />
            </div>
            <CapturaPortal informeId={informe.id} cual="argenprop" portal="Argenprop" url={capturasUrl.argenprop} deshabilitado={bloqueado} onCambio={() => void recargar()} />
          </>
        ) : null}
      </Seccion>

      <Seccion id="sec-ml" titulo="MercadoLibre" ayuda="Visitas, interesados y vistas del teléfono se traen solos. Se suman todos los avisos activos de la cuenta con la dirección de la propiedad, aunque se hayan publicado a mano.">
        <AvisosDeML
          avisos={informe.fuentes.mercadolibre?.estado === 'ok' ? informe.fuentes.mercadolibre.datos?.avisos ?? [] : []}
          excluidos={m.mercadolibre?.excluidos ?? []}
          deshabilitado={bloqueado}
          onCambiarExcluidos={lista => guardarManual(x => ({ ...x, mercadolibre: { ...x.mercadolibre, excluidos: lista } }), async () => { await api.traerFuente(informeId, 'mercadolibre') })}
        />
        <CampoLinea key={`ml-aviso-${versionCampos}`} id="ml-aviso" onPendiente={onPendiente} etiqueta="Agregar otro aviso de MercadoLibre" valor={m.mercadolibre?.aviso} placeholder="MLA1234567890 o el link del aviso" maxLength={500} deshabilitado={bloqueado}
          onGuardar={t => guardarManual(x => ({ ...x, mercadolibre: { ...x.mercadolibre, aviso: t } }), async () => { await api.traerFuente(informeId, 'mercadolibre') })} />
        <CapturaPortal informeId={informe.id} cual="mercadolibre" portal="MercadoLibre" url={capturasUrl.mercadolibre} deshabilitado={bloqueado} onCambio={() => void recargar()} />
      </Seccion>

      <Seccion id="sec-tiktok" titulo="TikTok" ayuda="Opcional. Si no hubo video en el período, dejalo vacío y la página no sale.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CampoNumero key={`tk-visualizaciones-${versionCampos}`} id="tk-visualizaciones" alTipear onPendiente={onPendiente} etiqueta="Visualizaciones del video" valor={m.tiktok?.visualizaciones} deshabilitado={bloqueado}
            onGuardar={n => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, visualizaciones: n } }))} />
          <CampoLinea key={`tk-total-${versionCampos}`} id="tk-total" alTipear onPendiente={onPendiente} etiqueta="Tiempo total" valor={m.tiktok?.tiempoTotal} placeholder="0h:23m:04s" maxLength={20} deshabilitado={bloqueado}
            onGuardar={t => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, tiempoTotal: t || undefined } }))} />
          <CampoLinea key={`tk-promedio-${versionCampos}`} id="tk-promedio" alTipear onPendiente={onPendiente} etiqueta="Tiempo promedio" valor={m.tiktok?.tiempoPromedio} placeholder="4.98s" maxLength={20} deshabilitado={bloqueado}
            onGuardar={t => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, tiempoPromedio: t || undefined } }))} />
          <CampoNumero key={`tk-completo-${versionCampos}`} id="tk-completo" alTipear onPendiente={onPendiente} etiqueta="Vieron el video completo" sufijo="%" valor={m.tiktok?.vieronCompleto} deshabilitado={bloqueado}
            onGuardar={n => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, vieronCompleto: n === undefined ? undefined : Math.min(n, 100) } }))} />
          <CampoNumero key={`tk-seguidores-${versionCampos}`} id="tk-seguidores" alTipear onPendiente={onPendiente} etiqueta="Nuevos seguidores" valor={m.tiktok?.nuevosSeguidores} deshabilitado={bloqueado}
            onGuardar={n => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, nuevosSeguidores: n } }))} />
        </div>
        <CapturaPortal informeId={informe.id} cual="tiktok" portal="TikTok" url={capturasUrl.tiktok} deshabilitado={bloqueado} onCambio={() => void recargar()} />
      </Seccion>

      <Seccion id="sec-textos" titulo="Información del período" ayuda="La plataforma los escribe con los datos del período y el estilo de los informes de Diego. Revisalos y corregí lo que haga falta: lo que corregís se mantiene. Cada renglón de las acciones es una viñeta en el informe.">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {escribiendo ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Escribiendo los textos…</span>
          ) : m.redaccion ? (
            <span className="text-muted-foreground">Escritos por la plataforma el {new Date(m.redaccion.generadoEn).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.</span>
          ) : null}
          {!escribiendo && textosDesactualizados(m) ? (
            <span role="status" className="w-full text-sm font-medium text-orange-700">Corregiste datos después de que se escribieron los textos: tocá «Volver a escribir» para que los usen.</span>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={bloqueado || escribiendo || trayendo !== null || fallo !== null} onClick={() => escribir(false)}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden /> {m.redaccion ? 'Volver a escribir' : 'Escribir los textos'}
          </Button>
        </div>
        <CampoTexto key={claveTexto('resumenMetricas')} revisar={aRevisar('resumenMetricas')} id="tx-metricas" alTipear onPendiente={onPendiente} etiqueta="Resumen de métricas" valor={m.textos?.resumenMetricas} deshabilitado={bloqueado} filas={3}
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, resumenMetricas: t } }))} />
        <CampoTexto key={claveTexto('accionesRealizadas')} revisar={aRevisar('accionesRealizadas')} id="tx-realizadas" alTipear onPendiente={onPendiente} etiqueta="Acciones realizadas" valor={m.textos?.accionesRealizadas} deshabilitado={bloqueado}
          falta={falta('Acciones realizadas')} ayuda="Una acción por renglón."
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, accionesRealizadas: t } }))} />
        <CampoTexto key={claveTexto('accionesARealizar')} revisar={aRevisar('accionesARealizar')} id="tx-a-realizar" alTipear onPendiente={onPendiente} etiqueta="Acciones a realizar para lograr vender" valor={m.textos?.accionesARealizar} deshabilitado={bloqueado}
          falta={falta('Acciones a realizar')} ayuda="Una acción por renglón."
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, accionesARealizar: t } }))} />
        <CampoTexto key={claveTexto('resumenConsultas')} revisar={aRevisar('resumenConsultas')} id="tx-consultas" alTipear onPendiente={onPendiente} etiqueta="Resumen de las consultas" valor={m.textos?.resumenConsultas} deshabilitado={bloqueado}
          ayuda={resumenDeLaFuente('consultas', informe.fuentes) ?? undefined}
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, resumenConsultas: t } }))} />
        <CampoTexto key={claveTexto('analisisFinal')} revisar={aRevisar('analisisFinal')} id="tx-analisis" alTipear onPendiente={onPendiente} etiqueta="Análisis final" valor={m.textos?.analisisFinal} deshabilitado={bloqueado} filas={6}
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, analisisFinal: t } }))} />
      </Seccion>

      <Seccion id="sec-competidoras" titulo="Propiedades que compiten" ayuda="La plataforma busca en el barrio avisos parecidos (ambientes, m², precio, antigüedad, disposición y estado). Miralos en el portal y agregá los que quieras al informe (hasta 8). Si después tocás «Volver a escribir», el análisis las compara.">
        <Competidoras iniciales={informe.competidoras} deshabilitado={bloqueado} onGuardar={guardarCompetidoras} onPendiente={onPendiente}
          busqueda={{
            candidatas: vista.candidatas, filtro: vista.filtroCompetencia, argenprop: informe.candidatas.argenprop, mercadolibre: informe.candidatas.mercadolibre,
            progreso: progresoCompetencia, onBuscarDeNuevo: () => void buscarCompetidoras(),
          }} />
      </Seccion>

      {!listo ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11" disabled={ocupado} onClick={verPrevia}>
              {armandoPdf === 'previa' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Eye className="mr-1 h-4 w-4" aria-hidden />} Vista previa
            </Button>
            <Button type="button" className="min-h-11" disabled={ocupado || faltantes.length > 0} onClick={marcarListo}>
              {armandoPdf === 'listo' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden />}
              {armandoPdf === 'listo' ? 'Armando el PDF…' : 'Marcar como listo'}
            </Button>
          </div>
          <EstadoDelGuardado estado={estadoDelGuardado({ guardando, escribiendo: nPendientes, fallo, guardadoEn })} />
        </div>
      ) : null}

      <Dialog open={!!previa} onOpenChange={o => { if (!o) cerrarPrevia() }}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
          <DialogTitle className="px-4 pt-4">Vista previa del informe</DialogTitle>
          <DialogDescription className="sr-only">El PDF tal como va a quedar con los datos guardados.</DialogDescription>
          {previa ? <iframe src={previa} title="Vista previa del informe" className="min-h-0 w-full flex-1" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Componentes de MÓDULO: ver CLAUDE.md § "NUNCA declarar un componente dentro de otro".
function EstadoDelGuardado({ estado }: { estado: ReturnType<typeof estadoDelGuardado> }) {
  if (estado.tipo === 'nada') return null
  return (
    <p role="status" aria-live="polite" className={cn('mx-auto mt-1 max-w-3xl text-right text-xs',
      estado.tipo === 'sin_guardar' ? 'font-medium text-orange-700' : estado.tipo === 'guardado' ? 'text-emerald-700' : 'text-muted-foreground')}>
      {estado.tipo === 'guardado' ? '✓ ' : ''}{estado.texto}
    </p>
  )
}

const ORIGEN_AVISO: Record<'plataforma' | 'cuenta' | 'manual', string> = {
  plataforma: 'publicado desde la plataforma', cuenta: 'encontrado en la cuenta por la dirección', manual: 'agregado a mano',
}

/** Los avisos de ML que se suman, con "No es de esta propiedad" para un emparejado por dirección equivocado. */
function AvisosDeML({ avisos, excluidos, deshabilitado, onCambiarExcluidos }: {
  avisos: Array<{ id: string; titulo: string | null; url: string | null; origen: 'plataforma' | 'cuenta' | 'manual' }>
  excluidos: string[]
  deshabilitado: boolean
  onCambiarExcluidos: (lista: string[]) => void
}) {
  if (!avisos.length && !excluidos.length) return <p className="text-sm text-muted-foreground">No hay avisos activos de MercadoLibre para esta propiedad.</p>
  return (
    <div className="space-y-2">
      {avisos.length ? <p className="text-sm font-medium">Avisos que se suman ({avisos.length})</p> : null}
      <ul className="space-y-2">
        {avisos.map(a => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{a.titulo ?? a.id}</span>
              <span className="block text-xs text-muted-foreground">{a.id} · {ORIGEN_AVISO[a.origen]}</span>
            </span>
            {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline">Ver en ML</a> : null}
            <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={deshabilitado}
              onClick={() => onCambiarExcluidos([...excluidos, a.id])}>No es de esta propiedad</Button>
          </li>
        ))}
      </ul>
      {excluidos.length ? (
        <p className="text-xs text-muted-foreground">
          Sacados: {excluidos.map((id, i) => (
            <span key={id}>{i ? ', ' : ''}{id} <button type="button" className="underline" disabled={deshabilitado}
              onClick={() => onCambiarExcluidos(excluidos.filter(x => x !== id))}>volver a sumar</button></span>
          ))}
        </p>
      ) : null}
    </div>
  )
}

/** Los textos se escriben solos una vez: con las fuentes listas, sin textos y sin haberlos escrito nunca. */
function debeEscribirSolo(v: VistaInforme): boolean {
  const i = v.informe
  if (i.estado !== 'borrador' || i.manual.redaccion) return false
  if (Object.values(i.manual.textos ?? {}).some(t => (t ?? '').trim())) return false
  return !Object.values(i.fuentes).some(f => !f || f.estado === 'pendiente')
}

function Volver({ propertyId }: { propertyId?: string }) {
  return (
    <Link href={propertyId ? `/properties/${propertyId}?tab=informes` : '/properties'} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la propiedad
    </Link>
  )
}

function FilaFuente({ nombre, vista, trayendo, deshabilitado, onReintentar, ajustes, bloqueado, onAjustar, onAutomatico, onPendiente, version }: {
  nombre: NombreFuente; vista: VistaInforme; trayendo: boolean; deshabilitado: boolean; onReintentar: () => void
  ajustes: Ajustes | undefined; bloqueado: boolean
  onAjustar: (campo: string, valor: number | boolean | string | null | undefined) => void
  onAutomatico: () => void
  onPendiente: AvisarPendiente
  /** Sube al volver al automático o al rechazarse un guardado: los campos se re-montan con el valor vigente. */
  version: number
}) {
  const [abierto, setAbierto] = useState(false)
  const f = vista.informe.fuentes[nombre]
  const automaticas = vista.informe.fuentesAutomaticas ?? vista.informe.fuentes
  const aMano = hayAjustes(ajustes, nombre)
  const rotulo = trayendo ? { texto: 'Trayendo…', tono: 'pendiente' as const }
    : aMano ? { texto: 'Cargado a mano', tono: 'neutro' as const } : rotuloDeLaFuente(f)
  const resumen = resumenDeLaFuente(nombre, vista.informe.fuentes)
  const automatico = aMano ? (resumenDeLaFuente(nombre, automaticas) || rotuloDeLaFuente(automaticas[nombre]).texto) : null
  return (
    <li className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{NOMBRE_FUENTE[nombre]}</p>
          {resumen ? <p className="text-sm text-muted-foreground">{resumen}</p> : null}
          {automatico ? <p className="text-xs text-muted-foreground">Automático: {automatico}</p> : null}
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONO[rotulo.tono])}>{rotulo.texto}</span>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={deshabilitado} onClick={onReintentar}
          aria-label={`Volver a traer: ${NOMBRE_FUENTE[nombre]}`}>
          {trayendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          <span className="ml-1">{f?.estado === 'error' ? 'Reintentar' : 'Actualizar'}</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={bloqueado} aria-expanded={abierto}
          aria-label={`Corregir a mano: ${NOMBRE_FUENTE[nombre]}`} onClick={() => setAbierto(a => !a)}>
          <Pencil className="mr-1 h-4 w-4" aria-hidden /> {abierto ? 'Cerrar' : 'Corregir a mano'}
        </Button>
      </div>
      {abierto ? (
        <div className="space-y-3 rounded-md bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Lo que cargues acá vale en todo el informe (resumen, textos y PDF). Un campo vacío usa lo que trae la plataforma.</p>
          <AjusteDeFuente key={`${nombre}-${version}`} nombre={nombre} automaticas={automaticas} ajustes={ajustes} deshabilitado={bloqueado}
            onCambiar={onAjustar} onPendiente={onPendiente} />
          {aMano ? (
            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={bloqueado} onClick={onAutomatico}>
              <Undo2 className="mr-1 h-4 w-4" aria-hidden /> Volver al automático
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

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
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Download, Eye, Loader2, RefreshCw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { fuentesPorTraer, resumenDeLaFuente, rotuloDeLaFuente, type Tono } from '@/lib/informes/editor'
import { textoDelPeriodo } from '@/lib/informes/periodo'
import type { VistaInforme } from '@/lib/informes/servicio'
import { FUENTES, type Competidora, type Manual, type NombreFuente } from '@/lib/informes/tipos'
import { cn } from '@/lib/utils'
import { generarPdfDelInforme } from '../pdf/generar'
import * as api from './api'
import { CampoLinea, CampoNumero, CampoTexto, Publicada, Seccion } from './campos'
import { CapturaPortal } from './CapturaPortal'
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
  const manualRef = useRef<Manual | null>(null)
  const cola = useRef<Promise<void>>(Promise.resolve())
  const yaTrajo = useRef(false)

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

  // Primera carga + traer las fuentes pendientes de a una.
  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        const vista = await api.leerVista(informeId)
        if (!vigente) return
        manualRef.current = vista.informe.manual
        setManual(vista.informe.manual)
        setFase({ tipo: 'lista', vista })
        if (vista.informe.estado !== 'borrador' || yaTrajo.current) return
        yaTrajo.current = true
        for (const nombre of fuentesPorTraer(vista.informe.fuentes)) {
          if (!vigente) return
          setTrayendo(nombre)
          try { await api.traerFuente(informeId, nombre) } catch { /* queda pendiente: se ve y se reintenta */ }
        }
        if (!vigente) return
        setTrayendo(null)
        await recargar()
      } catch (e) {
        if (vigente) setFase({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'No pudimos abrir el informe' })
      }
    })()
    return () => { vigente = false }
  }, [informeId, recargar])

  function reintentar(nombre: NombreFuente) {
    setTrayendo(nombre)
    void encolar(async () => {
      await api.traerFuente(informeId, nombre)
      await recargar()
    }).finally(() => setTrayendo(null))
  }

  function guardarManual(cambio: (m: Manual) => Manual, despues?: () => Promise<void>) {
    const siguiente = cambio(manualRef.current ?? {})
    manualRef.current = siguiente
    setManual(siguiente)
    setAviso(null)
    void encolar(async () => {
      await api.guardarManual(informeId, manualRef.current ?? siguiente)
      if (despues) await despues()
      await recargar()
    })
  }

  async function guardarCompetidoras(lista: Competidora[]) {
    setAviso(null)
    await encolar(async () => {
      await api.guardarCompetidoras(informeId, lista)
      await recargar()
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
      await api.subirPdfYMarcarListo(informeId, blob)
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
  const ocupado = armandoPdf !== null || guardando > 0

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
            <FilaFuente key={n} nombre={n} vista={vista} trayendo={trayendo === n} deshabilitado={listo || trayendo !== null} onReintentar={() => reintentar(n)} />
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
        <Publicada id="zp-publicado" portal="Zonaprop" publicado={m.zonaprop?.publicado} deshabilitado={listo}
          onCambiar={v => guardarManual(x => ({ ...x, zonaprop: { ...x.zonaprop, publicado: v } }))} />
        {m.zonaprop?.publicado !== false ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CampoNumero id="zp-exposicion" etiqueta="Exposición (veces en los listados)" valor={m.zonaprop?.exposicion} deshabilitado={listo}
                falta={falta('Zonaprop: exposición')} onGuardar={n => guardarManual(x => ({ ...x, zonaprop: { ...x.zonaprop, exposicion: n } }))} />
              <CampoNumero id="zp-visualizaciones" etiqueta="Visualizaciones (entraron al aviso)" valor={m.zonaprop?.visualizaciones} deshabilitado={listo}
                falta={falta('Zonaprop: visualizaciones', 'Zonaprop: exposición y')} onGuardar={n => guardarManual(x => ({ ...x, zonaprop: { ...x.zonaprop, visualizaciones: n } }))} />
              <CampoNumero id="zp-interesados" etiqueta="Interesados" valor={m.zonaprop?.interesados} deshabilitado={listo}
                onGuardar={n => guardarManual(x => ({ ...x, zonaprop: { ...x.zonaprop, interesados: n } }))} />
            </div>
            <CapturaPortal informeId={informe.id} cual="zonaprop" portal="Zonaprop" url={capturasUrl.zonaprop} deshabilitado={listo} onCambio={() => void recargar()} />
          </>
        ) : null}
      </Seccion>

      <Seccion id="sec-argenprop" titulo="Argenprop">
        <Publicada id="ap-publicado" portal="Argenprop" publicado={m.argenprop?.publicado} deshabilitado={listo}
          onCambiar={v => guardarManual(x => ({ ...x, argenprop: { ...x.argenprop, publicado: v } }))} />
        {m.argenprop?.publicado !== false ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CampoNumero id="ap-visualizaciones" etiqueta="Visualizaciones" valor={m.argenprop?.visualizaciones} deshabilitado={listo}
                falta={falta('Argenprop: visualizaciones')} onGuardar={n => guardarManual(x => ({ ...x, argenprop: { ...x.argenprop, visualizaciones: n } }))} />
            </div>
            <CapturaPortal informeId={informe.id} cual="argenprop" portal="Argenprop" url={capturasUrl.argenprop} deshabilitado={listo} onCambio={() => void recargar()} />
          </>
        ) : null}
      </Seccion>

      <Seccion id="sec-ml" titulo="MercadoLibre" ayuda="Las visitas al aviso se traen solas. Si la plataforma no conoce el aviso (se publicó a mano), pegá su link o su código MLA.">
        <CampoLinea id="ml-aviso" etiqueta="Aviso de MercadoLibre" valor={m.mercadolibre?.aviso} placeholder="MLA1234567890 o el link del aviso" deshabilitado={listo}
          onGuardar={t => guardarManual(x => ({ ...x, mercadolibre: { ...x.mercadolibre, aviso: t } }), async () => { await api.traerFuente(informeId, 'mercadolibre') })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['contactos', 'llamadas', 'whatsapp', 'preguntas'] as const).map(k => (
            <CampoNumero key={k} id={`ml-${k}`} etiqueta={{ contactos: 'Contactos', llamadas: 'Llamadas', whatsapp: 'WhatsApp', preguntas: 'Preguntas' }[k]}
              valor={m.mercadolibre?.[k]} deshabilitado={listo}
              onGuardar={n => guardarManual(x => ({ ...x, mercadolibre: { ...x.mercadolibre, [k]: n } }))} />
          ))}
        </div>
        <CapturaPortal informeId={informe.id} cual="mercadolibre" portal="MercadoLibre" url={capturasUrl.mercadolibre} deshabilitado={listo} onCambio={() => void recargar()} />
      </Seccion>

      <Seccion id="sec-tiktok" titulo="TikTok" ayuda="Opcional. Si no hubo video en el período, dejalo vacío y la página no sale.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CampoNumero id="tk-visualizaciones" etiqueta="Visualizaciones del video" valor={m.tiktok?.visualizaciones} deshabilitado={listo}
            onGuardar={n => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, visualizaciones: n } }))} />
          <CampoLinea id="tk-total" etiqueta="Tiempo total" valor={m.tiktok?.tiempoTotal} placeholder="0h:23m:04s" deshabilitado={listo}
            onGuardar={t => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, tiempoTotal: t || undefined } }))} />
          <CampoLinea id="tk-promedio" etiqueta="Tiempo promedio" valor={m.tiktok?.tiempoPromedio} placeholder="4.98s" deshabilitado={listo}
            onGuardar={t => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, tiempoPromedio: t || undefined } }))} />
          <CampoNumero id="tk-completo" etiqueta="Vieron el video completo" sufijo="%" valor={m.tiktok?.vieronCompleto} deshabilitado={listo}
            onGuardar={n => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, vieronCompleto: n === undefined ? undefined : Math.min(n, 100) } }))} />
          <CampoNumero id="tk-seguidores" etiqueta="Nuevos seguidores" valor={m.tiktok?.nuevosSeguidores} deshabilitado={listo}
            onGuardar={n => guardarManual(x => ({ ...x, tiktok: { ...x.tiktok, nuevosSeguidores: n } }))} />
        </div>
        <CapturaPortal informeId={informe.id} cual="tiktok" portal="TikTok" url={capturasUrl.tiktok} deshabilitado={listo} onCambio={() => void recargar()} />
      </Seccion>

      <Seccion id="sec-textos" titulo="Información del período" ayuda="Lo que pasó y lo que sigue, en tus palabras. Cada renglón de las acciones es una viñeta en el informe.">
        <CampoTexto id="tx-metricas" etiqueta="Resumen de métricas" valor={m.textos?.resumenMetricas} deshabilitado={listo} filas={3}
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, resumenMetricas: t } }))} />
        <CampoTexto id="tx-realizadas" etiqueta="Acciones realizadas" valor={m.textos?.accionesRealizadas} deshabilitado={listo}
          falta={falta('Acciones realizadas')} ayuda="Una acción por renglón."
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, accionesRealizadas: t } }))} />
        <CampoTexto id="tx-a-realizar" etiqueta="Acciones a realizar para lograr vender" valor={m.textos?.accionesARealizar} deshabilitado={listo}
          falta={falta('Acciones a realizar')} ayuda="Una acción por renglón."
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, accionesARealizar: t } }))} />
        <CampoTexto id="tx-consultas" etiqueta="Resumen de las consultas" valor={m.textos?.resumenConsultas} deshabilitado={listo}
          ayuda={resumenDeLaFuente('consultas', informe.fuentes) ?? undefined}
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, resumenConsultas: t } }))} />
        <CampoTexto id="tx-analisis" etiqueta="Análisis final" valor={m.textos?.analisisFinal} deshabilitado={listo} filas={6}
          onGuardar={t => guardarManual(x => ({ ...x, textos: { ...x.textos, analisisFinal: t } }))} />
      </Seccion>

      <Seccion id="sec-competidoras" titulo="Propiedades que compiten" ayuda="Pegá el link del aviso y se completan los datos. Lo que el portal no muestre lo podés completar a mano.">
        <Competidoras iniciales={informe.competidoras} deshabilitado={listo} onGuardar={guardarCompetidoras} />
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
          {guardando > 0 ? <p className="mx-auto mt-1 max-w-3xl text-right text-xs text-muted-foreground">Guardando…</p> : null}
        </div>
      ) : null}

      <Dialog open={!!previa} onOpenChange={o => { if (!o) cerrarPrevia() }}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
          <DialogTitle className="px-4 pt-4">Vista previa del informe</DialogTitle>
          {previa ? <iframe src={previa} title="Vista previa del informe" className="min-h-0 w-full flex-1" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Componentes de MÓDULO: ver CLAUDE.md § "NUNCA declarar un componente dentro de otro".
function Volver({ propertyId }: { propertyId?: string }) {
  return (
    <Link href={propertyId ? `/properties/${propertyId}?tab=informes` : '/properties'} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la propiedad
    </Link>
  )
}

function FilaFuente({ nombre, vista, trayendo, deshabilitado, onReintentar }: {
  nombre: NombreFuente; vista: VistaInforme; trayendo: boolean; deshabilitado: boolean; onReintentar: () => void
}) {
  const f = vista.informe.fuentes[nombre]
  const rotulo = trayendo ? { texto: 'Trayendo…', tono: 'pendiente' as const } : rotuloDeLaFuente(f)
  const resumen = resumenDeLaFuente(nombre, vista.informe.fuentes)
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{NOMBRE_FUENTE[nombre]}</p>
        {resumen ? <p className="text-sm text-muted-foreground">{resumen}</p> : null}
      </div>
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONO[rotulo.tono])}>{rotulo.texto}</span>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={deshabilitado} onClick={onReintentar}
        aria-label={`Volver a traer: ${NOMBRE_FUENTE[nombre]}`}>
        {trayendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        <span className="ml-1">{f?.estado === 'error' ? 'Reintentar' : 'Actualizar'}</span>
      </Button>
    </li>
  )
}

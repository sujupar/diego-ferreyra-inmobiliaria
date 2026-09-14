'use client'

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import Image from 'next/image'
import { VideoProgressTracker } from '@/lib/funnel/video-progress'
import { getOrCreateAnonId } from '@/lib/funnel/anon-id'
import { isHeatmapPreview } from '@/lib/funnel/heatmap-preview'
import { vslBarFraction } from '@/lib/funnel/vsl-bar'

interface FunnelClickToPlayVideoProps {
  src: string
  poster?: string
  className?: string
  /** true para el poster del hero (LCP): lo marca priority/fetchPriority=high. */
  priority?: boolean
  /** Si se pasa, mide el % visto y lo manda a /api/track/video. Slug estable del video. */
  trackKey?: string
  /** 'tasacion' | 'clase' — para segmentar en Embudos. */
  funnel?: string
  /** 'hero' | 'clase' — contexto del video. */
  context?: string
  /**
   * Empieza a traer el video ANTES del click para que reproducir sea inmediato.
   * Opt-in: con `preload="none"` el click recién abre conexión y busca el índice,
   * y eso son varios segundos de espera mirando una pantalla quieta.
   */
  warmup?: boolean
  /**
   * Barra de retención en vez de los controles nativos: sin duración, sin tiempo
   * transcurrido y sin poder adelantar. Opt-in, para las VSL largas.
   */
  vslBar?: boolean
}

/**
 * Video CLICK-TO-PLAY reutilizable (sin autoplay).
 *
 * REPRODUCCIÓN CONFIABLE EN MOBILE (fix 2026-07-28): el <video> vive SIEMPRE en el
 * DOM con `preload="none"` (cero bytes hasta el play, el LCP sigue siendo el poster),
 * y el click llama `video.play()` DENTRO del gesto del usuario. Antes se montaba el
 * <video> con `autoPlay` tras un re-render de React: iOS/Android lo trataban como
 * autoplay-con-sonido NO gestual y lo BLOQUEABAN → el video no arrancaba y la vista
 * nunca se registraba (87% del tráfico es mobile). Si aun así el navegador rechaza
 * el play con sonido, cae a `muted` y ofrece "Activar sonido".
 *
 * Si recibe `trackKey`, mide el % visto (atención + profundidad + cuartiles), el
 * INTENTO de reproducción y si el playback realmente arrancó, y lo envía
 * idempotentemente a /api/track/video (sendBeacon al ocultar/cerrar).
 */
export function FunnelClickToPlayVideo({
  src,
  poster,
  className,
  priority = false,
  trackKey,
  funnel,
  context,
  warmup = false,
  vslBar = false,
}: FunnelClickToPlayVideoProps) {
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
  const [muted, setMuted] = useState(false)
  const [fraction, setFraction] = useState(0)
  // Último recurso: si ni con `muted` arranca, se devuelven los controles del
  // navegador. Sin esto, apagar `controls` dejaría al visitante sin ninguna
  // forma de reproducir.
  const [nativeFallback, setNativeFallback] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackerRef = useRef<VideoProgressTracker | null>(null)
  const anonIdRef = useRef<string>('')
  const lastSampledSec = useRef<number>(-1)
  const lastFlushMs = useRef<number>(0)
  // Métricas de reproducción: intentos (clicks en play) y si el playback arrancó.
  const playIntentsRef = useRef<number>(0)
  const startedRef = useRef<boolean>(false)

  const flush = useCallback(
    (useBeacon: boolean) => {
      if (!trackKey) return
      if (isHeatmapPreview()) return // visor del panel: no trackear
      const tr = trackerRef.current
      // Mandamos también cuando solo hubo INTENTO (sin reproducción): así el panel
      // puede mostrar la tasa real de play y detectar bloqueos del navegador.
      if (!tr && playIntentsRef.current <= 0) return
      if (!anonIdRef.current) anonIdRef.current = getOrCreateAnonId()
      const snap = tr?.snapshot()
      const payload = {
        anonId: anonIdRef.current,
        videoKey: trackKey,
        context: context ?? null,
        funnel: funnel ?? null,
        pagePath: typeof location !== 'undefined' ? location.pathname : null,
        durationS: snap?.durationS || null,
        watchSeconds: snap?.watchSeconds ?? 0,
        maxPercent: snap?.maxPercent ?? 0,
        quartiles: snap?.quartiles ?? 0,
        completed: snap?.completed ?? false,
        watchedBuckets: snap?.watchedBuckets ?? null,
        playIntents: playIntentsRef.current,
        playbackStarted: startedRef.current,
      }
      const url = '/api/track/video'
      try {
        if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'application/json' }))
        } else {
          void fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {})
        }
      } catch {
        /* tracking best-effort */
      }
    },
    [trackKey, funnel, context],
  )

  // Flush al ocultar la pestaña / cerrar (sendBeacon, nunca en unload → respeta bfcache).
  useEffect(() => {
    if (!trackKey) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(true)
    }
    const onPageHide = () => flush(true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      flush(true) // flush final al desmontar
    }
  }, [trackKey, flush])

  /**
   * Precalentado en dos escalones, para no pagar el ancho de banda de todos los
   * visitantes que nunca le dan play:
   *   1. cuando el navegador está ocioso → `metadata` (unos KB: el índice).
   *   2. cuando el reproductor se ve en pantalla o hay intención de tocarlo →
   *      `auto`, que ya llena buffer.
   * El `preload` arranca igual en "none", así que el LCP sigue siendo el póster.
   */
  useEffect(() => {
    if (!warmup) return
    const v = videoRef.current
    const cont = contenedorRef.current
    if (!v) return

    let cancelado = false
    const subir = (nivel: 'metadata' | 'auto') => {
      if (cancelado || playing) return
      try {
        if (v.preload === 'auto') return
        v.preload = nivel
        v.load()
      } catch {
        /* si el navegador no deja precargar, el click sigue funcionando igual */
      }
    }

    // `requestIdleCallback` no está en todos los navegadores (Safari viejo) y no
    // se puede preguntar con `'x' in window`: TypeScript estrecha el tipo a
    // `never` en la otra rama. Se lee la propiedad y se comprueba que sea función.
    type ConIdle = {
      requestIdleCallback?: (cb: () => void, opciones?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const win = window as unknown as ConIdle

    const alOcioso = () => subir('metadata')
    let idleId: number | undefined
    let idleTimeout: number | undefined
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(alOcioso, { timeout: 2500 })
    } else {
      idleTimeout = window.setTimeout(alOcioso, 1500)
    }

    const conIntencion = () => subir('auto')
    cont?.addEventListener('pointerenter', conIntencion, { once: true })
    cont?.addEventListener('touchstart', conIntencion, { once: true, passive: true })

    // En celular no hay hover: si el reproductor queda a la vista, se precarga igual.
    let visibleTimer: number | undefined
    let io: IntersectionObserver | undefined
    if (cont && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entradas) => {
          const visible = entradas.some((e) => e.isIntersecting)
          if (visible && visibleTimer === undefined) {
            visibleTimer = window.setTimeout(conIntencion, 1200)
          } else if (!visible && visibleTimer !== undefined) {
            window.clearTimeout(visibleTimer)
            visibleTimer = undefined
          }
        },
        { threshold: 0.35 },
      )
      io.observe(cont)
    }

    return () => {
      cancelado = true
      if (idleId !== undefined && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId)
      }
      if (idleTimeout !== undefined) window.clearTimeout(idleTimeout)
      cont?.removeEventListener('pointerenter', conIntencion)
      cont?.removeEventListener('touchstart', conIntencion)
      if (visibleTimer !== undefined) window.clearTimeout(visibleTimer)
      io?.disconnect()
    }
  }, [warmup, playing])

  function ensureTracker(): VideoProgressTracker {
    if (!trackerRef.current) trackerRef.current = new VideoProgressTracker()
    return trackerRef.current
  }

  /** Click en "reproducir": registra el intento y arranca DENTRO del gesto. */
  async function handlePlayClick() {
    playIntentsRef.current += 1
    setPlaying(true)
    const v = videoRef.current
    if (!v) return
    try {
      await v.play() // gesto directo → los navegadores móviles lo permiten con sonido
    } catch {
      // Algunos navegadores igual bloquean el sonido: caemos a muted y ofrecemos activarlo.
      try {
        v.muted = true
        setMuted(true)
        await v.play()
        setNeedsUnmute(true)
      } catch {
        // Si tampoco arranca, se devuelven los controles nativos como salida.
        setNativeFallback(true)
      }
    }
  }

  function unmute() {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    setMuted(false)
    setNeedsUnmute(false)
    void v.play().catch(() => {})
  }

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    if (!v.muted) setNeedsUnmute(false)
  }

  /** Pausa/reanuda tocando el video (reemplaza al botón nativo cuando `vslBar`). */
  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play().catch(() => {})
    else v.pause()
  }

  function handleLoadedMetadata(e: SyntheticEvent<HTMLVideoElement>) {
    ensureTracker().setDuration(e.currentTarget.duration)
  }
  function handlePlaying() {
    startedRef.current = true
    setPaused(false)
    if (trackKey) flush(false) // confirma la reproducción efectiva cuanto antes
  }
  function handleTimeUpdate(e: SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget
    const t = v.currentTime
    // La barra se actualiza en CADA timeupdate (~4/s) para que se vea fluida; el
    // tracking sigue muestreando una vez por segundo, como antes.
    if (vslBar && v.duration > 0) setFraction(vslBarFraction(t / v.duration))
    if (!trackKey) return
    const sec = Math.floor(t)
    if (sec === lastSampledSec.current) return // throttle ~1/s
    lastSampledSec.current = sec
    ensureTracker().sample(t)
    const now = Date.now()
    if (now - lastFlushMs.current > 15_000) {
      lastFlushMs.current = now
      flush(false)
    }
  }
  function handlePause() {
    setPaused(true)
    flush(false)
  }
  function handleEnded() {
    setPaused(true)
    if (vslBar) setFraction(1)
    ensureTracker().markEnded()
    flush(true)
  }

  const tracked = Boolean(trackKey)
  // Con `vslBar` los controles nativos se apagan: mostrarían la duración y
  // permitirían adelantar, que es justo lo que se quiere evitar. Si el navegador
  // bloqueó la reproducción, vuelven como salida de emergencia.
  const nativeControls = playing && (!vslBar || nativeFallback)

  return (
    <div
      ref={contenedorRef}
      className={`relative w-full overflow-hidden rounded-xl bg-black ${className ?? ''}`}
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* El <video> vive siempre en el DOM (preload="none" → 0 bytes hasta el play)
          para poder llamar play() dentro del gesto del usuario. */}
      <video
        ref={videoRef}
        src={src}
        preload="none"
        playsInline
        controls={nativeControls}
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        onLoadedMetadata={tracked ? handleLoadedMetadata : undefined}
        onPlaying={tracked || vslBar ? handlePlaying : undefined}
        onTimeUpdate={tracked || vslBar ? handleTimeUpdate : undefined}
        onPause={tracked || vslBar ? handlePause : undefined}
        onEnded={tracked || vslBar ? handleEnded : undefined}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {/* Capa de control propia: tocar para pausar/reanudar, sin tiempos ni seek. */}
      {playing && vslBar && !nativeFallback && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={paused ? 'Reanudar video' : 'Pausar video'}
          data-hm-tag="video"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer"
        >
          {paused && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00BF63] shadow-lg sm:h-20 sm:w-20">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="ml-1 h-7 w-7 text-white sm:h-9 sm:w-9">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          )}
        </button>
      )}

      {/* Barra de retención: sin duración, sin tiempo, sin poder adelantar. */}
      {playing && vslBar && !nativeFallback && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3">
          <div className="h-[6px] w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-[#00BF63] transition-[width] duration-300 ease-linear"
              style={{ width: `${(fraction * 100).toFixed(2)}%` }}
            />
          </div>
        </div>
      )}

      {/* Sonido: único control visible además de pausar. */}
      {playing && vslBar && !nativeFallback && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Activar sonido' : 'Silenciar'}
          data-hm-tag="video"
          className="absolute bottom-6 right-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
            {muted ? (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2-3.74v2.05l1.96 1.96c.03-.09.04-.18.04-.27zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.9 8.9 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3z" />
            ) : (
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            )}
          </svg>
        </button>
      )}

      {!playing && (
        <button
          type="button"
          onClick={handlePlayClick}
          aria-label="Reproducir video"
          data-hm-tag="video"
          className="group absolute inset-0 z-10 h-full w-full"
        >
          {poster && (
            <Image
              src={poster}
              alt=""
              fill
              priority={priority}
              quality={60}
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/40">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00BF63] shadow-lg transition group-hover:scale-105 sm:h-20 sm:w-20">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="ml-1 h-7 w-7 text-white sm:h-9 sm:w-9"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}

      {needsUnmute && (
        <button
          type="button"
          onClick={unmute}
          data-hm-tag="video"
          className="absolute bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#00BF63] px-4 py-2 text-sm font-bold text-white shadow-lg"
        >
          🔊 Activá el sonido
        </button>
      )}
    </div>
  )
}

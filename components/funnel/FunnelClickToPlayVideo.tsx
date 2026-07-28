'use client'

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import Image from 'next/image'
import { VideoProgressTracker } from '@/lib/funnel/video-progress'
import { getOrCreateAnonId } from '@/lib/funnel/anon-id'
import { isHeatmapPreview } from '@/lib/funnel/heatmap-preview'

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
}: FunnelClickToPlayVideoProps) {
  const [playing, setPlaying] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
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
        await v.play()
        setNeedsUnmute(true)
      } catch {
        /* si tampoco arranca, el usuario tiene los controles nativos */
      }
    }
  }

  function unmute() {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    setNeedsUnmute(false)
    void v.play().catch(() => {})
  }

  function handleLoadedMetadata(e: SyntheticEvent<HTMLVideoElement>) {
    ensureTracker().setDuration(e.currentTarget.duration)
  }
  function handlePlaying() {
    startedRef.current = true
    if (trackKey) flush(false) // confirma la reproducción efectiva cuanto antes
  }
  function handleTimeUpdate(e: SyntheticEvent<HTMLVideoElement>) {
    const t = e.currentTarget.currentTime
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
    flush(false)
  }
  function handleEnded() {
    ensureTracker().markEnded()
    flush(true)
  }

  const tracked = Boolean(trackKey)

  return (
    <div
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
        controls={playing}
        onLoadedMetadata={tracked ? handleLoadedMetadata : undefined}
        onPlaying={tracked ? handlePlaying : undefined}
        onTimeUpdate={tracked ? handleTimeUpdate : undefined}
        onPause={tracked ? handlePause : undefined}
        onEnded={tracked ? handleEnded : undefined}
        className="absolute inset-0 h-full w-full object-contain"
      />

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
          className="absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#00BF63] px-4 py-2 text-sm font-bold text-white shadow-lg"
        >
          🔊 Activá el sonido
        </button>
      )}
    </div>
  )
}

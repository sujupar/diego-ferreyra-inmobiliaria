'use client'

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import Image from 'next/image'
import { VideoProgressTracker } from '@/lib/funnel/video-progress'
import { getOrCreateAnonId } from '@/lib/funnel/anon-id'

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
 * Video CLICK-TO-PLAY reutilizable (sin autoplay). Al montar muestra SOLO el
 * poster (sin precargar video) + botón play; al click monta y reproduce el
 * <video> con sonido (autoPlay válido tras gesto del usuario).
 *
 * Si recibe `trackKey`, mide el % visto (atención real + profundidad + cuartiles)
 * y lo envía idempotentemente a /api/track/video (sendBeacon al ocultar/cerrar).
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
  const trackerRef = useRef<VideoProgressTracker | null>(null)
  const anonIdRef = useRef<string>('')
  const lastSampledSec = useRef<number>(-1)
  const lastFlushMs = useRef<number>(0)

  const flush = useCallback(
    (useBeacon: boolean) => {
      const tr = trackerRef.current
      if (!trackKey || !tr || tr.watchSeconds <= 0) return
      if (!anonIdRef.current) anonIdRef.current = getOrCreateAnonId()
      const snap = tr.snapshot()
      const payload = {
        anonId: anonIdRef.current,
        videoKey: trackKey,
        context: context ?? null,
        funnel: funnel ?? null,
        pagePath: typeof location !== 'undefined' ? location.pathname : null,
        durationS: snap.durationS || null,
        watchSeconds: snap.watchSeconds,
        maxPercent: snap.maxPercent,
        quartiles: snap.quartiles,
        completed: snap.completed,
        watchedBuckets: snap.watchedBuckets,
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

  function handleLoadedMetadata(e: SyntheticEvent<HTMLVideoElement>) {
    ensureTracker().setDuration(e.currentTarget.duration)
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
      {playing ? (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          preload="none"
          onLoadedMetadata={tracked ? handleLoadedMetadata : undefined}
          onTimeUpdate={tracked ? handleTimeUpdate : undefined}
          onPause={tracked ? handlePause : undefined}
          onEnded={tracked ? handleEnded : undefined}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Reproducir video"
          className="group absolute inset-0 h-full w-full"
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
    </div>
  )
}

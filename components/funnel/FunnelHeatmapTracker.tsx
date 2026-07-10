'use client'

import { useEffect } from 'react'
import { getOrCreateAnonId } from '@/lib/funnel/anon-id'
import { HeatmapSession } from '@/lib/funnel/heatmap-session'
import { isHeatmapPreview } from '@/lib/funnel/heatmap-preview'

function deviceBucket(): string {
  const w = window.innerWidth
  return w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop'
}

/**
 * Mapa de calor INTERNO: mide scroll, tiempo por sección y clics (relativos a la
 * sección `data-hm`) y los manda a /api/track/heatmap. Sin DOM-recording, sin PII,
 * sin apps externas. Invisible (return null). No bloquea nada (todo en useEffect).
 */
export function FunnelHeatmapTracker({ page, funnel }: { page: string; funnel: string }) {
  useEffect(() => {
    if (isHeatmapPreview()) return // visor del panel: no trackear al admin mirando el mapa
    const session = new HeatmapSession()
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-hm]'))
    session.registerSections(els.map((e) => e.dataset.hm ?? '').filter(Boolean))
    const device = deviceBucket()
    let anonId = ''
    const ensureAnon = () => {
      if (!anonId) anonId = getOrCreateAnonId()
      return anonId
    }

    // Tiempo visible por sección (IntersectionObserver).
    const visibleSince = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        const now = Date.now()
        for (const en of entries) {
          const key = (en.target as HTMLElement).dataset.hm
          if (!key) continue
          if (en.isIntersecting && en.intersectionRatio >= 0.5) {
            session.markReached(key)
            if (!visibleSince.has(key)) visibleSince.set(key, now)
          } else {
            const since = visibleSince.get(key)
            if (since != null) {
              session.addVisibleMs(key, now - since)
              visibleSince.delete(key)
            }
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    )
    els.forEach((e) => io.observe(e))

    // Scroll depth (throttle con rAF).
    let scrollRaf = 0
    const onScroll = () => {
      if (scrollRaf) return
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0
        const docH = document.documentElement.scrollHeight
        if (docH > 0) session.setScroll(((window.scrollY + window.innerHeight) / docH) * 100)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    // Clicks (posición relativa a la sección + tipo de elemento).
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const sectionEl = target.closest<HTMLElement>('[data-hm]')
      const key = sectionEl?.dataset.hm ?? null
      let xPct = 50
      let yPct = 50
      if (sectionEl) {
        const r = sectionEl.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          xPct = ((e.clientX - r.left) / r.width) * 100
          yPct = ((e.clientY - r.top) / r.height) * 100
        }
      }
      const tag = target.closest('button')
        ? 'button'
        : target.closest('a')
          ? 'a'
          : target.closest('video')
            ? 'video'
            : 'other'
      session.addClick({ section: key, xPct, yPct, tag, nowMs: Date.now(), rawX: e.clientX, rawY: e.clientY })
    }
    document.addEventListener('click', onClick, true)

    const flush = (useBeacon: boolean) => {
      // Cerrar el tiempo visible en curso antes de snapshot.
      const now = Date.now()
      for (const [key, since] of visibleSince) {
        session.addVisibleMs(key, now - since)
        visibleSince.set(key, now)
      }
      if (!session.hasData()) return
      const snap = session.snapshot()
      const payload = {
        anonId: ensureAnon(),
        page,
        funnel,
        device,
        maxScrollPct: snap.maxScrollPct,
        sections: snap.sections,
        clicks: snap.clicks,
      }
      const url = '/api/track/heatmap'
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
    }

    const interval = setInterval(() => flush(false), 15_000)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(true)
    }
    const onPageHide = () => flush(true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      clearInterval(interval)
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      flush(true)
    }
  }, [page, funnel])

  return null
}

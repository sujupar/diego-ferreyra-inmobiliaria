'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { isHeatmapPreview } from '@/lib/funnel/heatmap-preview'

/**
 * Overlay del mapa de calor SOBRE la landing real. Solo se activa cuando la
 * página se abre con ?hm_preview=1 (embebida en el visor del panel Embudos).
 *
 * Protocolo (postMessage, mismo origin):
 *  - overlay → padre: { type:'df-heatmap-ready' } al montar y
 *    { type:'df-heatmap-height', height } cuando cambia la altura del documento.
 *  - padre → overlay: { type:'df-heatmap-data', sections, grid } con las métricas
 *    ya filtradas (fecha/segmento/dispositivo). El overlay NO consulta nada
 *    privilegiado: solo dibuja lo que el panel (autenticado) le manda.
 */

interface OverlaySection {
  key: string
  reachedPct: number
  avgSec: number
  clicks: number
}
interface OverlayCell {
  section: string
  x_bin: number
  y_bin: number
  clicks: number
  rage: number
}
interface OverlayData {
  sections: OverlaySection[]
  grid: OverlayCell[]
}

interface SectionRect {
  key: string
  top: number
  left: number
  width: number
  height: number
}

export function HeatmapOverlay() {
  const [enabled, setEnabled] = useState(false)
  const [data, setData] = useState<OverlayData | null>(null)
  const [rects, setRects] = useState<SectionRect[]>([])
  const [docH, setDocH] = useState(0)

  // Activación + canal con el padre.
  useEffect(() => {
    if (!isHeatmapPreview()) return
    // Activar en el próximo frame (evita setState síncrono en el effect y
    // cualquier mismatch de hidratación: el primer render siempre es null).
    const raf = requestAnimationFrame(() => setEnabled(true))
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as { type?: string; sections?: OverlaySection[]; grid?: OverlayCell[] } | null
      if (d && d.type === 'df-heatmap-data') {
        setData({ sections: d.sections ?? [], grid: d.grid ?? [] })
      }
    }
    window.addEventListener('message', onMsg)
    try {
      window.parent?.postMessage({ type: 'df-heatmap-ready' }, window.location.origin)
    } catch {
      /* sin padre (abierta directa) */
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('message', onMsg)
    }
  }, [])

  // Medir secciones en coordenadas de documento + reportar altura al padre.
  useEffect(() => {
    if (!enabled) return
    let lastH = 0
    const measure = () => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-hm]'))
      setRects(
        els.map((el) => {
          const r = el.getBoundingClientRect()
          return {
            key: el.dataset.hm ?? '',
            top: r.top + window.scrollY,
            left: r.left + window.scrollX,
            width: r.width,
            height: r.height,
          }
        }),
      )
      const h = document.documentElement.scrollHeight
      setDocH(h)
      if (h !== lastH) {
        lastH = h
        try {
          window.parent?.postMessage({ type: 'df-heatmap-height', height: h }, window.location.origin)
        } catch {
          /* sin padre */
        }
      }
    }
    measure()
    window.addEventListener('resize', measure)
    // El layout puede cambiar (imágenes/fuentes/lazy) — re-medimos periódicamente.
    const iv = setInterval(measure, 1200)
    return () => {
      window.removeEventListener('resize', measure)
      clearInterval(iv)
    }
  }, [enabled, data])

  if (!enabled || typeof document === 'undefined') return null

  const maxClicks = data ? Math.max(1, ...data.grid.map((g) => g.clicks), 1) : 1
  const secStats = new Map((data?.sections ?? []).map((s) => [s.key, s]))

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-[9999] w-full"
      style={{ height: docH || undefined }}
    >
      {data &&
        rects.map((r) => {
          const stats = secStats.get(r.key)
          const cells = data.grid.filter((g) => g.section === r.key)
          return (
            <div key={r.key}>
              {/* contorno de la sección */}
              <div
                className="absolute rounded-sm border border-dashed border-sky-400/50"
                style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
              />
              {/* badge con métricas de la sección */}
              {stats && (
                <div
                  className="absolute flex items-center gap-1.5 rounded-full bg-[#0d2d49]/90 px-2.5 py-1 text-[11px] font-medium text-white shadow"
                  style={{ top: r.top + 6, left: r.left + 6, maxWidth: r.width - 12 }}
                >
                  <span className="text-sky-300">{stats.reachedPct}% llegó</span>
                  <span className="text-white/60">·</span>
                  <span>{stats.avgSec}s</span>
                  <span className="text-white/60">·</span>
                  <span className="text-orange-300">{stats.clicks} clics</span>
                </div>
              )}
              {/* blobs de calor (clics) */}
              {cells.map((c, i) => {
                const intensity = c.clicks / maxClicks
                const size = 22 + intensity * 34
                return (
                  <div
                    key={i}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      top: r.top + ((c.y_bin * 5 + 2.5) / 100) * r.height,
                      left: r.left + ((c.x_bin * 5 + 2.5) / 100) * r.width,
                      width: size,
                      height: size,
                      background: `radial-gradient(circle, rgba(255,${Math.round(140 - intensity * 140)},0,${0.35 + intensity * 0.45}) 0%, rgba(255,60,0,0) 70%)`,
                    }}
                  />
                )
              })}
            </div>
          )
        })}
    </div>,
    document.body,
  )
}

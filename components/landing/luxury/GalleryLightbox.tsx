'use client'

/**
 * E1.9 — Galería curada con lightbox + PUERTA DE REGISTRO (E2.0).
 *
 * Se muestran GRATIS las primeras `FREE_PHOTOS` fotos. El resto se ve —borroso,
 * con candado— para generar intriga: se percibe que hay más para ver. Al tocar
 * cualquiera bloqueada (o el botón), se abre el popup de registro; cuando la
 * persona deja sus datos, la galería se desbloquea al instante y queda
 * desbloqueada en ese navegador (`LeadCaptureProvider`).
 *
 * Es una puerta COMERCIAL, no de seguridad: las URLs siguen en el HTML. El
 * objetivo es la conversión, no proteger las fotos.
 *
 * Accesibilidad conservada: lightbox con teclado (←/→/Esc), focus-trap, swipe
 * táctil, foco al abrir y restauración al cerrar.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useLeadCapture, GALLERY_LOCK_SOURCE } from '../LeadCaptureProvider'

interface GalleryImage {
  src: string
  alt?: string
}

/** Fotos visibles sin registrarse. */
const FREE_PHOTOS = 3
/** Cuántas bloqueadas se muestran como "adelanto" borroso. */
const TEASER_PHOTOS = 6
/** Ya desbloqueada: cuántas se muestran antes de "Ver galería completa". */
const INITIAL = 9

export function GalleryLightbox({
  images,
  eyebrow,
  title,
}: {
  images: GalleryImage[]
  eyebrow?: string
  title?: string
}) {
  const { open: openLeadCapture, unlocked } = useLeadCapture()
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  const justExpandedRef = useRef(false)

  const locked = !unlocked && images.length > FREE_PHOTOS
  // Con la galería bloqueada el lightbox SOLO navega las fotos libres: si no,
  // las flechas revelarían justamente lo que estamos pidiendo registrarse para ver.
  const navigable = locked ? images.slice(0, FREE_PHOTOS) : images
  const freeImages = locked ? images.slice(0, FREE_PHOTOS) : (showAll ? images : images.slice(0, INITIAL))
  const lockedImages = locked ? images.slice(FREE_PHOTOS, FREE_PHOTOS + TEASER_PHOTOS) : []
  const hiddenCount = locked ? images.length - FREE_PHOTOS : images.length - freeImages.length
  const isOpen = openIdx !== null

  const go = useCallback(
    (dir: number) => setOpenIdx(i => (i === null ? i : (i + dir + navigable.length) % navigable.length)),
    [navigable.length],
  )
  const open = useCallback((i: number) => {
    triggerRef.current = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null)
    setOpenIdx(i)
  }, [])
  const close = useCallback(() => setOpenIdx(null), [])

  const requestUnlock = useCallback(() => {
    openLeadCapture(GALLERY_LOCK_SOURCE)
  }, [openLeadCapture])

  // Si se desbloquea con el lightbox abierto, cerrarlo para que la persona vea
  // la galería completa (y para no dejar un índice fuera de rango).
  useEffect(() => {
    if (unlocked) setOpenIdx(null)
  }, [unlocked])

  // Scroll-lock + teclado (←/→/Esc/Tab-trap) + foco al botón cerrar. Depende de
  // `isOpen` (no de openIdx) → NO se re-ejecuta al navegar con flechas.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'Tab') {
        // Focus-trap: el Tab cicla dentro del diálogo (no se escapa al fondo).
        const root = dialogRef.current
        if (!root) return
        const f = root.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
        if (f.length === 0) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        } else if (!root.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => closeBtnRef.current?.focus(), 30)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [isOpen, close, go])

  // Restaura el foco al disparador SOLO en la transición abierto→cerrado (no en
  // cada flecha, que antes robaba el foco al fondo en cada paso).
  useEffect(() => {
    if (isOpen) wasOpenRef.current = true
    else if (wasOpenRef.current) {
      wasOpenRef.current = false
      triggerRef.current?.focus?.()
    }
  }, [isOpen])

  // Al expandir "Ver galería completa", mover el foco a la primera foto revelada
  // (sino cae a <body> al desmontarse el botón).
  useEffect(() => {
    if (showAll && justExpandedRef.current) {
      justExpandedRef.current = false
      gridRef.current?.querySelectorAll('button')[INITIAL]?.focus()
    }
  }, [showAll])

  // Swipe táctil en el lightbox.
  const touchX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
    touchX.current = null
  }

  if (images.length === 0) return null
  const current = openIdx !== null ? navigable[openIdx] : null

  return (
    <>
      {(eyebrow || title) && (
        <div className="mb-10 text-center md:mb-14">
          {eyebrow && <p className="lx-eyebrow">{eyebrow}</p>}
          {title && <h2 className="mt-3 text-3xl md:text-5xl">{title}</h2>}
        </div>
      )}

      <div ref={gridRef} className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {freeImages.map((img, i) => (
          <button
            key={`free-${i}`}
            type="button"
            onClick={() => open(i)}
            aria-label={`Ampliar foto ${i + 1}`}
            className={`group overflow-hidden ${i === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.alt ?? ''}
              loading="lazy"
              className="aspect-square h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </button>
        ))}

        {/* Adelanto bloqueado: se VE que hay más, pero borroso y con candado. */}
        {lockedImages.map((img, i) => (
          <button
            key={`locked-${i}`}
            type="button"
            onClick={requestUnlock}
            aria-label={`Foto bloqueada ${FREE_PHOTOS + i + 1} — registrate para verla`}
            className="group relative overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="aspect-square h-full w-full scale-105 object-cover blur-lg brightness-90 transition duration-500 group-hover:blur-md"
            />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white transition group-hover:bg-black/25">
              <Lock className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.5} />
              {i === 0 && (
                <span className="px-3 text-center text-xs font-medium uppercase tracking-wider">
                  Ver más
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Bloqueada: invitación clara a registrarse. */}
      {locked && (
        <div className="mt-10 text-center">
          <p className="mb-4 text-base md:text-lg">
            Quedan <strong>{hiddenCount} fotos</strong> para conocerla por dentro.
          </p>
          <button
            type="button"
            onClick={requestUnlock}
            className="lx-eyebrow inline-flex items-center gap-2 border px-8 py-4 transition-colors hover:bg-[color:var(--lx-navy)] hover:text-white"
            style={{ borderColor: 'var(--lx-navy)' }}
          >
            <Lock className="h-4 w-4" strokeWidth={1.5} />
            Ver todas las fotos
          </button>
          <p className="mt-3 text-xs text-black/50">
            Dejanos tus datos y las ves al instante.
          </p>
        </div>
      )}

      {/* Ya desbloqueada y con muchas fotos: revelado progresivo de siempre. */}
      {!locked && hiddenCount > 0 && !showAll && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => {
              justExpandedRef.current = true
              setShowAll(true)
            }}
            className="lx-eyebrow border px-8 py-4 transition-colors hover:text-white"
            style={{ borderColor: 'var(--lx-navy)' }}
          >
            Ver galería completa
          </button>
        </div>
      )}

      {current && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/92 p-4 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Galería de fotos"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* backdrop */}
          <button type="button" aria-label="Cerrar" onClick={close} className="absolute inset-0" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.src}
            alt={current.alt ?? ''}
            className="relative z-10 max-h-[86vh] max-w-[92vw] object-contain shadow-2xl"
          />
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white transition hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
          {navigable.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Anterior"
                onClick={() => go(-1)}
                className="absolute left-3 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 text-white transition hover:bg-white/10 md:left-6"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Siguiente"
                onClick={() => go(1)}
                className="absolute right-3 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 text-white transition hover:bg-white/10 md:right-6"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          {/* Desde el lightbox de las fotos libres también se puede desbloquear. */}
          {locked && (
            <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
              <button
                type="button"
                onClick={requestUnlock}
                className="inline-flex items-center gap-2 rounded-full bg-white/95 px-6 py-3 text-sm font-medium text-slate-900 shadow-lg transition hover:bg-white"
              >
                <Lock className="h-4 w-4" strokeWidth={1.5} />
                Ver las {hiddenCount} fotos restantes
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

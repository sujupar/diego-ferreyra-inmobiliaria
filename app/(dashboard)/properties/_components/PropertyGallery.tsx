'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function PropertyGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  if (!photos.length) {
    return (
      <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground rounded-lg">
        Sin fotos
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        <div
          className="relative aspect-video bg-muted rounded-lg overflow-hidden cursor-zoom-in"
          onClick={() => setLightbox(true)}
        >
          <Image
            src={photos[active]}
            alt={`${alt} ${active + 1}`}
            fill
            className="object-cover"
            sizes="(max-width: 1200px) 100vw, 800px"
          />
        </div>
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={cn(
                  'relative size-16 shrink-0 rounded overflow-hidden border-2',
                  i === active ? 'border-primary' : 'border-transparent'
                )}
              >
                <Image src={p} alt={`${alt} thumb ${i + 1}`} fill className="object-cover" sizes="64px" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-6xl p-0 bg-black/95 border-0">
          <div className="relative aspect-video">
            <Image src={photos[active]} alt={`${alt} ${active + 1}`} fill className="object-contain" sizes="100vw" />
            <button
              onClick={() => setLightbox(false)}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2"
              aria-label="Cerrar"
            >
              <X className="size-5 text-white" />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setActive((active - 1 + photos.length) % photos.length)}
                  className="absolute top-1/2 left-4 -translate-y-1/2 bg-white/10 hover:bg-white/20 rounded-full p-2"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="size-6 text-white" />
                </button>
                <button
                  onClick={() => setActive((active + 1) % photos.length)}
                  className="absolute top-1/2 right-4 -translate-y-1/2 bg-white/10 hover:bg-white/20 rounded-full p-2"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="size-6 text-white" />
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

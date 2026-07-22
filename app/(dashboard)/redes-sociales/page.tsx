'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Row {
  id: string
  title: string | null
  topic: string
  status: string
  progress_percent: number
  cta_type: string
  created_at: string
  thumb: string | null
}

const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  generating_script: { label: 'Generando', variant: 'secondary' },
  generating_images: { label: 'Generando', variant: 'secondary' },
  ready: { label: 'Listo', variant: 'default' },
  failed: { label: 'Error', variant: 'destructive' },
}

export default function RedesSocialesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/social/carousels')
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setRows(d.carousels) })
      .catch((e) => setError(String(e.message)))
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Redes Sociales</h1>
          <p className="text-muted-foreground text-sm mt-1">Carruseles de campaña generados con la identidad de marca.</p>
        </div>
        <Link href="/redes-sociales/nuevo"><Button>+ Nuevo carrusel</Button></Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows && !error && <p className="text-muted-foreground text-sm">Cargando…</p>}
      {rows && rows.length === 0 && (
        <div className="text-center py-16 border rounded-xl border-dashed">
          <p className="text-muted-foreground">Todavía no generaste ningún carrusel.</p>
          <Link href="/redes-sociales/nuevo"><Button className="mt-4">Crear el primero</Button></Link>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {(rows || []).map((c) => {
          const st = STATUS[c.status] || STATUS.generating_images
          return (
            <Link key={c.id} href={`/redes-sociales/${c.id}`}
              className="group block rounded-xl border overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-[4/5] bg-muted relative">
                {c.thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.thumb} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">sin preview</div>}
                <Badge variant={st.variant} className="absolute top-2 right-2">{st.label}</Badge>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium line-clamp-2 group-hover:text-primary">{c.title || c.topic}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleDateString('es-AR')}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

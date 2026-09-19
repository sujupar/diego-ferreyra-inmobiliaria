import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/require-role'
import { heatmapPage, heatmapPagesOfFunnel, heatmapPreviewSrc, heatmapRealHref } from '@/lib/funnel/heatmap-pages'
import { HeatmapViewerClient } from './HeatmapViewerClient'

export const dynamic = 'force-dynamic'

export default async function HeatmapViewerPage({ params }: { params: Promise<{ page: string }> }) {
  await requireRole('admin', 'dueno') // mismo gate que /embudos
  const { page } = await params
  // Las páginas válidas salen del catálogo único: la lista que había acá a mano no
  // conocía a la landing B de tasación y su calor no se podía ver.
  const def = heatmapPage(page)
  if (!def) notFound()

  const versions = heatmapPagesOfFunnel(def.funnel).map((p) => ({ page: p.page, tabLabel: p.tabLabel }))

  return (
    // `key`: al saltar de la versión A a la B cambia la ruta pero NO el componente.
    // Sin remontarlo, el calor de la A (todavía en memoria) se pintaría un instante
    // sobre la landing B hasta que llegaran los datos nuevos.
    <HeatmapViewerClient
      key={def.page}
      page={def.page}
      label={def.label}
      src={heatmapPreviewSrc(def)}
      realHref={heatmapRealHref(def)}
      versions={versions}
    />
  )
}

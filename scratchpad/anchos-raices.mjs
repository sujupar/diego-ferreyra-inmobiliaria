// Le pone ancho DEFINIDO (`w-full`) a las raíces de pantalla que hoy son
// `mx-auto` y por eso quedan en `fit-content` — o sea, con piso igual al
// min-content de lo que llevan adentro, que es lo que empujaba `#contenido` de
// costado. Reemplazo literal; si algo no calza exactamente una vez, aborta.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..')

const cambios = [
  ['app/(dashboard)/settings/page.tsx', '"max-w-4xl mx-auto space-y-8"', '"w-full max-w-4xl mx-auto space-y-8"'],
  ['app/(dashboard)/settings/notifications/page.tsx', '"p-6 max-w-5xl mx-auto space-y-6"', '"w-full p-6 max-w-5xl mx-auto space-y-6"'],
  ['app/(dashboard)/appraisal/new/page.tsx', '"max-w-5xl mx-auto space-y-12 pb-20"', '"w-full max-w-5xl mx-auto space-y-12 pb-20"'],
  ['app/(dashboard)/pipeline/new/page.tsx', '"space-y-6 max-w-2xl mx-auto"', '"w-full space-y-6 max-w-2xl mx-auto"'],
  ['app/(dashboard)/pipeline/[id]/page.tsx', '"space-y-6 max-w-3xl mx-auto"', '"w-full space-y-6 max-w-3xl mx-auto"'],
  ['app/(dashboard)/avisos/AvisosClient.tsx', '"space-y-6 p-6 max-w-3xl mx-auto"', '"w-full space-y-6 p-6 max-w-3xl mx-auto"'],
  ['app/(dashboard)/contacts/new/page.tsx', '"space-y-6 max-w-xl mx-auto"', '"w-full space-y-6 max-w-xl mx-auto"'],
  ['app/(dashboard)/contacts/[id]/page.tsx', '"space-y-6 max-w-4xl mx-auto"', '"w-full space-y-6 max-w-4xl mx-auto"'],
  ['app/(dashboard)/admin/ai-usage/AiUsageClient.tsx', '"max-w-4xl mx-auto space-y-8"', '"w-full max-w-4xl mx-auto space-y-8"'],
  ['app/(dashboard)/admin/email-test/EmailTestClient.tsx', '"space-y-6 max-w-4xl mx-auto pb-20"', '"w-full space-y-6 max-w-4xl mx-auto pb-20"'],
  ['app/(dashboard)/admin/ai-agent/AgentLabClient.tsx', '"mx-auto max-w-5xl space-y-6"', '"w-full mx-auto max-w-5xl space-y-6"'],
  ['app/(dashboard)/redes-sociales/page.tsx', '"max-w-5xl mx-auto px-4 py-8"', '"w-full max-w-5xl mx-auto px-4 py-8"'],
  ['app/(dashboard)/redes-sociales/[id]/page.tsx', '"max-w-5xl mx-auto px-4 py-8"', '"w-full max-w-5xl mx-auto px-4 py-8"'],
  ['app/(dashboard)/redes-sociales/nuevo/page.tsx', '"max-w-2xl mx-auto px-4 py-8"', '"w-full max-w-2xl mx-auto px-4 py-8"'],
  ['app/(dashboard)/properties/review/page.tsx', '"space-y-6 max-w-4xl mx-auto"', '"w-full space-y-6 max-w-4xl mx-auto"'],
  ['app/(dashboard)/properties/[id]/page.tsx', '"space-y-6 max-w-6xl mx-auto pb-10"', '"w-full space-y-6 max-w-6xl mx-auto pb-10"'],
  ['app/(dashboard)/properties/new/page.tsx', '"space-y-6 max-w-3xl mx-auto"', '"w-full space-y-6 max-w-3xl mx-auto"'],
  ['app/(dashboard)/mi-perfil/page.tsx', '"mx-auto max-w-3xl px-6 py-8 space-y-6"', '"w-full mx-auto max-w-3xl px-6 py-8 space-y-6"'],
  ["app/(dashboard)/inbox/InboxTabs.tsx", "'space-y-6 max-w-7xl mx-auto'", "'w-full space-y-6 max-w-7xl mx-auto'"],
]

let fallo = false
for (const [rel, viejo, nuevo] of cambios) {
  const abs = path.join(raiz, rel)
  const src = readFileSync(abs, 'utf8')
  const veces = src.split(viejo).length - 1
  if (veces !== 1) {
    console.log(`FALLA  ${rel} — ${veces} coincidencias de ${viejo}`)
    fallo = true
    continue
  }
  writeFileSync(abs, src.replace(viejo, nuevo))
  console.log(`OK     ${rel}`)
}
process.exit(fallo ? 1 : 0)

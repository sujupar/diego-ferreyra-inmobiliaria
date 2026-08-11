// Segunda tanda: las raíces de retorno que el diagnóstico no había listado
// (ramas de carga y de error, que son raíz igual que la rama feliz).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..')

const cambios = [
  ['app/(dashboard)/appraisal/new/page.tsx', '"max-w-5xl mx-auto text-center py-20"', '"w-full max-w-5xl mx-auto text-center py-20"', 1],
  ['app/(dashboard)/appraisals/[id]/page.tsx', '"max-w-5xl mx-auto space-y-8 pb-20"', '"w-full max-w-5xl mx-auto space-y-8 pb-20"', 2],
  ['app/(dashboard)/appraisals/[id]/page.tsx', '"max-w-5xl mx-auto text-center py-20"', '"w-full max-w-5xl mx-auto text-center py-20"', 2],
  ['app/(dashboard)/inbox/InboxClient.tsx', '"space-y-6 max-w-7xl mx-auto"', '"w-full space-y-6 max-w-7xl mx-auto"', 1],
  ['app/(dashboard)/redes-sociales/[id]/page.tsx', '"max-w-4xl mx-auto p-8"', '"w-full max-w-4xl mx-auto p-8"', 1],
  ['app/(dashboard)/redes-sociales/[id]/page.tsx', '"max-w-4xl mx-auto p-8 text-muted-foreground"', '"w-full max-w-4xl mx-auto p-8 text-muted-foreground"', 1],
]

let fallo = false
for (const [rel, viejo, nuevo, esperadas] of cambios) {
  const abs = path.join(raiz, rel)
  const src = readFileSync(abs, 'utf8')
  const veces = src.split(viejo).length - 1
  if (veces !== esperadas) {
    console.log(`FALLA  ${rel} — ${veces} coincidencias (esperaba ${esperadas}) de ${viejo}`)
    fallo = true
    continue
  }
  writeFileSync(abs, src.split(viejo).join(nuevo))
  console.log(`OK     ${rel} (${veces})`)
}
process.exit(fallo ? 1 : 0)

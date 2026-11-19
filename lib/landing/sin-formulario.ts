/**
 * Saca el formulario DENTRO de la página de un documento de landing guardado.
 *
 * Decisión del dueño (2026-11-18): ninguna landing lleva un formulario en la
 * página; toda conversión pasa por el popup que abren los botones. Las
 * plantillas viejas ("Editorial Directo", "Cinematic") terminaban con un bloque
 * `lead_form`, y dos landings publicadas quedaron así.
 *
 * Reemplaza cada `lead_form` por un botón `cta` (texto por defecto: "Ver el
 * recorrido de la propiedad") en el MISMO lugar y deja todo lo demás intacto.
 * Pura e idempotente: un documento sin formulario vuelve igual (`cambios: 0`).
 * La usa `scripts/quitar-formulario-landings.ts` sobre `content` y `draft_content`.
 */
import type { LandingDocument } from './schema'

type Bloque = LandingDocument['blocks'][number]

export function quitarFormulario(doc: LandingDocument): { doc: LandingDocument; cambios: number } {
  const usados = new Set(doc.blocks.map(b => b.id))
  let cambios = 0
  const blocks = doc.blocks.map((b): Bloque => {
    if (b.type !== 'lead_form') return b
    cambios++
    // Id estable y único: 'cta-final', o 'cta-final-2'... si ya existe.
    let id = 'cta-final'
    for (let n = 2; usados.has(id); n++) id = `cta-final-${n}`
    usados.add(id)
    return { id, type: 'cta' }
  })
  return cambios === 0 ? { doc, cambios } : { doc: { ...doc, blocks }, cambios }
}

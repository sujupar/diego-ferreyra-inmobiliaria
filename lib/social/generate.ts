/**
 * Orquestación de la generación de un carrusel, slide por slide.
 * processNextSlide() procesa UN slide pendiente (genera imagen → compone → sube
 * a Storage → actualiza la fila). Es el motor de la continuación del lado del
 * cliente: cada poll de GET /status llama una vez a esta función.
 */
import { join } from 'node:path'
import { composeSlide } from './compose'
import { generateScene, generateBackground, FACIAL_LOCK, IMAGE_QUALITY } from './openai'
import { uploadSlidePng, uploadRawScene, downloadPng, admin } from './storage'
import type { ScriptSlide } from './brand-bible'

const DIEGO_REFS = [
  join(process.cwd(), 'public', 'social', 'diego', 'diego-head.png'),
  join(process.cwd(), 'public', 'social', 'diego', 'diego-body.png'),
]

/** copy (jsonb) guarda el detalle de display; role/layout/accent/image_* son columnas. */
export function slideToRow(slide: ScriptSlide, position: number) {
  return {
    position,
    role: slide.role,
    layout: slide.layout,
    accent: slide.accent,
    image_kind: slide.image_kind,
    image_prompt: slide.image_prompt,
    status: 'pending' as const,
    copy: {
      eyebrow: slide.eyebrow,
      title: slide.title,
      body: slide.body,
      cta_label: slide.cta_label,
      items: slide.items,
      testimonial_key: slide.testimonial_key,
    },
  }
}

export function rowToScriptSlide(row: any): ScriptSlide {
  const c = row.copy || {}
  return {
    role: row.role,
    layout: row.layout,
    accent: row.accent,
    eyebrow: c.eyebrow || '',
    title: c.title || '',
    body: c.body || '',
    cta_label: c.cta_label || '',
    image_kind: row.image_kind || 'none',
    image_prompt: row.image_prompt || '',
    testimonial_key: c.testimonial_key || 'none',
    items: c.items || [],
  }
}

function diegoPrompt(aiScene: string): string {
  return [
    'Usá a la MISMA PERSONA EXACTA de las fotos de referencia: el mismo hombre, con su rostro idéntico.',
    FACIAL_LOCK,
    'Fotografía editorial vertical 4:5, fotorrealista, calidad premium.',
    `ESCENA: ${aiScene || 'una oficina inmobiliaria luminosa y profesional, desenfocada al fondo. El hombre con expresión de confianza y una sonrisa sobria.'}`,
    'ENCUADRE: retrato en plano medio (de la cintura hacia arriba), el hombre CENTRADO y llenando el encuadre vertical; fondo de oficina desenfocado.',
    'PALETA: tonos azul marino y neutros. NEGATIVOS: sin texto, sin letras, sin logos, sin marcas de agua, manos naturales, no cambies la cara.',
  ].join(' ')
}

/**
 * Procesa el próximo slide con status='pending'. Devuelve si el carrusel quedó
 * completo y el progreso. Idempotente por slide (cada uno se procesa una vez).
 */
export async function processNextSlide(carouselId: string): Promise<{ done: boolean; progress: number }> {
  const db = admin()

  const { data: slides, error: se } = await db
    .from('social_carousel_slides')
    .select('*')
    .eq('carousel_id', carouselId)
    .order('position', { ascending: true })
  if (se) throw new Error(`slides: ${se.message}`)

  const total = (slides || []).length
  const pending = (slides || []).find((s: any) => s.status === 'pending')

  if (!pending) {
    await db.from('social_carousels').update({ status: 'ready', progress_percent: 100, updated_at: new Date().toISOString() }).eq('id', carouselId)
    return { done: true, progress: 100 }
  }

  try {
    const slide = rowToScriptSlide(pending)

    // 1. Generar la escena (si aplica).
    let rawScene: Buffer | undefined
    if (slide.image_kind === 'concept' && slide.image_prompt) {
      rawScene = await generateBackground(slide.image_prompt, { size: '1024x1536', quality: IMAGE_QUALITY })
    } else if (slide.image_kind === 'diego') {
      rawScene = await generateScene({ prompt: diegoPrompt(slide.image_prompt), referencePaths: DIEGO_REFS, size: '1024x1536', quality: IMAGE_QUALITY })
    }
    const sceneUri = rawScene ? `data:image/png;base64,${rawScene.toString('base64')}` : undefined

    // 2. Componer + subir.
    const png = await composeSlide(slide, sceneUri, { page: pending.position, total })
    const storagePath = await uploadSlidePng(carouselId, pending.position, png)
    const rawPath = rawScene ? await uploadRawScene(carouselId, pending.position, rawScene) : null

    // 3. Actualizar el slide.
    await db.from('social_carousel_slides')
      .update({ status: 'composed', storage_url: storagePath, image_storage_url: rawPath })
      .eq('id', pending.id)

    // 4. Progreso.
    const composedCount = (slides || []).filter((s: any) => s.status === 'composed').length + 1
    const progress = Math.round((composedCount / total) * 100)
    const done = composedCount >= total
    await db.from('social_carousels')
      .update({ status: done ? 'ready' : 'generating_images', progress_percent: progress, updated_at: new Date().toISOString() })
      .eq('id', carouselId)

    return { done, progress }
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 400)
    await db.from('social_carousel_slides').update({ status: 'failed', error_message: msg }).eq('id', pending.id)
    await db.from('social_carousels').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', carouselId)
    throw e
  }
}

// ---- Edición post-generación ----
async function genScene(slide: ScriptSlide): Promise<{ raw?: Buffer; uri?: string }> {
  let raw: Buffer | undefined
  if (slide.image_kind === 'concept' && slide.image_prompt) {
    raw = await generateBackground(slide.image_prompt, { size: '1024x1536', quality: IMAGE_QUALITY })
  } else if (slide.image_kind === 'diego') {
    raw = await generateScene({ prompt: diegoPrompt(slide.image_prompt), referencePaths: DIEGO_REFS, size: '1024x1536', quality: IMAGE_QUALITY })
  }
  return { raw, uri: raw ? `data:image/png;base64,${raw.toString('base64')}` : undefined }
}

async function slideCount(carouselId: string): Promise<number> {
  const { count } = await admin()
    .from('social_carousel_slides')
    .select('id', { count: 'exact', head: true })
    .eq('carousel_id', carouselId)
  return count || 0
}

/** Regenera la IMAGEN de un slide (cuesta 1 gpt-image-2) y recompone. */
export async function regenerateSlideImage(carouselId: string, position: number, imagePromptOverride?: string): Promise<void> {
  const db = admin()
  const { data: row } = await db.from('social_carousel_slides').select('*').eq('carousel_id', carouselId).eq('position', position).single()
  if (!row) throw new Error('slide no existe')
  const slide = rowToScriptSlide(row)
  if (imagePromptOverride) slide.image_prompt = imagePromptOverride
  const total = await slideCount(carouselId)
  const { raw, uri } = await genScene(slide)
  const png = await composeSlide(slide, uri, { page: position, total })
  const storagePath = await uploadSlidePng(carouselId, position, png)
  const rawPath = raw ? await uploadRawScene(carouselId, position, raw) : (row as any).image_storage_url
  await db.from('social_carousel_slides')
    .update({ storage_url: storagePath, image_storage_url: rawPath, image_prompt: slide.image_prompt, status: 'composed' })
    .eq('id', (row as any).id)
}

/** Edita el COPY de un slide y re-renderiza el texto sobre la escena cacheada (sin gastar imagen). */
export async function recomposeSlideText(carouselId: string, position: number, newCopy: Record<string, any>): Promise<void> {
  const db = admin()
  const { data: row } = await db.from('social_carousel_slides').select('*').eq('carousel_id', carouselId).eq('position', position).single()
  if (!row) throw new Error('slide no existe')
  const merged = { ...((row as any).copy || {}), ...newCopy }
  const slide = rowToScriptSlide({ ...(row as any), copy: merged })
  let uri: string | undefined
  if ((row as any).image_storage_url) {
    const buf = await downloadPng((row as any).image_storage_url)
    uri = `data:image/png;base64,${buf.toString('base64')}`
  }
  const total = await slideCount(carouselId)
  const png = await composeSlide(slide, uri, { page: position, total })
  const storagePath = await uploadSlidePng(carouselId, position, png)
  await db.from('social_carousel_slides').update({ copy: merged, storage_url: storagePath }).eq('id', (row as any).id)
}

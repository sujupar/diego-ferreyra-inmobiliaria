/**
 * Runner asíncrono para generar las 27 piezas gráficas de una campaña.
 *
 * Genera: 3 fotos seleccionadas × 3 composiciones × 3 formatos = 27 piezas.
 *
 * Por timeout de Netlify Functions (60s con maxDuration=60), las 27 piezas
 * NO se pueden generar en una sola request. La estrategia es generar en
 * batches de 3 piezas (~30-45s cada batch) coordinados desde el frontend
 * que va llamando `runBatch` hasta que progress=100%.
 *
 * El estado del job vive en `meta_launch_jobs`; cada pieza generada se
 * persiste en `property_ad_assets` con el `launch_job_id`.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { Property } from '@/lib/portals/types'
import { generateAdImage } from './ad-image-generator'
import type { CompositionStyle, AdFormat } from './ad-image-prompts'
import type { PropertyHighlight } from './property-vision-analyzer'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const META_API = 'https://graph.facebook.com/v21.0'

/**
 * Estructura de las 27 piezas: ordenadas en una grilla determinística para
 * que el "índice de pieza" sea estable entre reintentos.
 *
 *   idx 0:  photo 0 × style 0 × format 0 (feed_square)
 *   idx 1:  photo 0 × style 0 × format 1 (feed_vertical)
 *   idx 2:  photo 0 × style 0 × format 2 (story_vertical)
 *   idx 3:  photo 0 × style 1 × format 0
 *   ...
 *   idx 26: photo 2 × style 2 × format 2
 *
 * Total: 3 × 3 × 3 = 27.
 */
const STYLE_TRIO: CompositionStyle[] = [
  'split_photo_info',
  'editorial_magazine',
  'color_overlay_solid',
]
const FORMAT_TRIO: AdFormat[] = ['feed_square', 'feed_vertical', 'story_vertical']
const TOTAL_PIECES = 27

interface PieceCoords {
  pieceIdx: number
  photoSourceIdx: number // 0, 1, 2 (índice dentro de las 3 starred photos)
  styleIdx: number // 0, 1, 2
  formatIdx: number // 0, 1, 2
  style: CompositionStyle
  format: AdFormat
}

function pieceCoordsAt(idx: number): PieceCoords {
  const formatIdx = idx % 3
  const styleIdx = Math.floor(idx / 3) % 3
  const photoSourceIdx = Math.floor(idx / 9) // 0, 1, 2
  return {
    pieceIdx: idx,
    photoSourceIdx,
    styleIdx,
    formatIdx,
    style: STYLE_TRIO[styleIdx],
    format: FORMAT_TRIO[formatIdx],
  }
}

interface JobRow {
  id: string
  property_id: string
  starred_photo_indices: number[] | null
  selected_avatar_id: string | null
  optimized_avatar: Record<string, unknown> | null
  status: string
  progress_percent: number | null
}

async function loadJob(jobId: string): Promise<JobRow | null> {
  const supabase = getAdmin()
  const { data } = await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (a: string, b: string) => {
          maybeSingle: () => Promise<{ data: JobRow | null }>
        }
      }
    }
  })
    .from('meta_launch_jobs')
    .select('id, property_id, starred_photo_indices, selected_avatar_id, optimized_avatar, status, progress_percent')
    .eq('id', jobId)
    .maybeSingle()
  return data
}

async function updateJob(jobId: string, fields: Record<string, unknown>): Promise<void> {
  const supabase = getAdmin()
  await (supabase as unknown as {
    from: (t: string) => {
      update: (f: Record<string, unknown>) => {
        eq: (a: string, b: string) => Promise<unknown>
      }
    }
  })
    .from('meta_launch_jobs')
    .update(fields)
    .eq('id', jobId)
}

async function loadProperty(propertyId: string): Promise<Property | null> {
  const supabase = getAdmin()
  const { data } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .maybeSingle()
  return data as unknown as Property | null
}

async function uploadToMeta(buffer: Buffer, filename: string): Promise<{ hash: string; url: string | null }> {
  const accountIdRaw = process.env.META_AD_ACCOUNT_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  if (!accountIdRaw || !accessToken) {
    throw new Error('META_AD_ACCOUNT_ID o META_ACCESS_TOKEN faltantes')
  }
  const accountId = accountIdRaw.startsWith('act_') ? accountIdRaw : `act_${accountIdRaw}`
  const form = new FormData()
  form.set('access_token', accessToken)
  form.set(filename, new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), filename)
  const res = await fetch(`${META_API}/${accountId}/adimages`, { method: 'POST', body: form })
  if (!res.ok) {
    throw new Error(`Meta /adimages ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    images?: Record<string, { hash: string; url?: string }>
  }
  const first = Object.values(data.images ?? {})[0]
  if (!first?.hash) throw new Error('No hash en respuesta Meta')
  return { hash: first.hash, url: first.url ?? null }
}

async function persistAsset(input: {
  propertyId: string
  jobId: string
  pieceIdx: number
  photoIdx: number
  styleIdx: number
  format: AdFormat
  style: CompositionStyle
  metaHash: string
  metaUrl: string | null
  promptHash: string | null
}): Promise<void> {
  const supabase = getAdmin()
  const highlight_id = `piece_${input.pieceIdx}` // estructura plana por job
  await (supabase as unknown as {
    from: (t: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<unknown>
    }
  })
    .from('property_ad_assets')
    .upsert(
      {
        property_id: input.propertyId,
        highlight_id,
        format: input.format,
        prompt_hash: input.promptHash ?? 'fallback',
        meta_image_hash: input.metaHash,
        storage_url: input.metaUrl,
        photo_source_index: input.photoIdx,
        composition_variant: input.styleIdx,
        launch_job_id: input.jobId,
      },
      { onConflict: 'property_id,highlight_id,format' },
    )
}

export interface RunBatchResult {
  jobId: string
  generatedInBatch: number
  totalGenerated: number
  totalPieces: number
  progressPercent: number
  done: boolean
  failures: number
}

/**
 * Genera un batch de N piezas (default 3) para el job dado.
 * Retorna el progreso actualizado.
 *
 * El caller (frontend) llama runBatch repetidamente hasta done=true.
 */
export async function runBatch(input: {
  jobId: string
  batchSize?: number
}): Promise<RunBatchResult> {
  const batchSize = input.batchSize ?? 3
  const job = await loadJob(input.jobId)
  if (!job) throw new Error(`Job ${input.jobId} no existe`)
  if (job.status !== 'generating' && job.status !== 'analyzing') {
    throw new Error(`Job en status ${job.status} — no se puede generar`)
  }

  const property = await loadProperty(job.property_id)
  if (!property) throw new Error('Property no existe')

  const starredPhotos = job.starred_photo_indices ?? []
  if (starredPhotos.length === 0) {
    throw new Error('El job no tiene starred_photo_indices')
  }

  // Determinar cuántas piezas ya están generadas (para retomar tras un crash)
  const supabase = getAdmin()
  const { count: alreadyDone } = await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string, opts: { count: 'exact'; head: boolean }) => {
        eq: (a: string, b: string) => Promise<{ count: number | null }>
      }
    }
  })
    .from('property_ad_assets')
    .select('id', { count: 'exact', head: true })
    .eq('launch_job_id', input.jobId)
  const startIdx = alreadyDone ?? 0

  if (startIdx >= TOTAL_PIECES) {
    await updateJob(input.jobId, {
      status: 'awaiting_confirm',
      progress_percent: 100,
      current_step: 'all_pieces_generated',
    })
    return {
      jobId: input.jobId,
      generatedInBatch: 0,
      totalGenerated: TOTAL_PIECES,
      totalPieces: TOTAL_PIECES,
      progressPercent: 100,
      done: true,
      failures: 0,
    }
  }

  let generated = 0
  let failures = 0
  const endIdx = Math.min(startIdx + batchSize, TOTAL_PIECES)

  // Determinar el highlight semilla del avatar para el copy de la pieza
  const avatar = (job.optimized_avatar ?? null) as
    | { hooks?: string[]; shortLabel?: string }
    | null
  const fallbackHeadline = avatar?.shortLabel ?? `${property.property_type} en ${property.neighborhood}`

  for (let i = startIdx; i < endIdx; i++) {
    const coords = pieceCoordsAt(i)
    const realPhotoIdx = starredPhotos[coords.photoSourceIdx]
    const photoUrl = (property.photos as string[])[realPhotoIdx] ?? (property.photos as string[])[0]

    // Update progress al iniciar la pieza
    await updateJob(input.jobId, {
      current_step: `generating_piece_${i + 1}_of_${TOTAL_PIECES}`,
      progress_percent: Math.floor(((i + 0.5) / TOTAL_PIECES) * 100),
    })

    // Highlight sintético para el generador (no estamos usando los highlights del vision aquí
    // porque las 3 fotos starred ya son la guía).
    const fakeHighlight: PropertyHighlight = {
      id: `starred_${coords.photoSourceIdx}`,
      label: avatar?.hooks?.[coords.photoSourceIdx] ?? fallbackHeadline,
      reasoning: `Foto seleccionada por el asesor como #${coords.photoSourceIdx + 1}`,
      photoIndex: realPhotoIdx,
      mood: 'luminoso',
      impactScore: 100 - coords.photoSourceIdx * 10,
    }

    try {
      const generated_image = await generateAdImage({
        property,
        highlight: fakeHighlight,
        copyHeadline: avatar?.hooks?.[coords.styleIdx] ?? fallbackHeadline,
        format: coords.format,
        compositionStyle: coords.style,
        overridePhotoUrl: photoUrl,
      })

      let metaHash: string
      let metaUrl: string | null = null
      let promptHash: string | null = null
      if (generated_image) {
        promptHash = generated_image.promptHash
        const { hash, url } = await uploadToMeta(
          generated_image.buffer,
          `${property.public_slug ?? property.id}_p${i}_${coords.style}_${coords.format}.jpg`,
        )
        metaHash = hash
        metaUrl = url
      } else {
        // Fallback: subir la foto original cruda (no rompe el flow)
        const photoRes = await fetch(photoUrl)
        const photoBuf = Buffer.from(await photoRes.arrayBuffer())
        const { hash, url } = await uploadToMeta(
          photoBuf,
          `${property.public_slug ?? property.id}_p${i}_fallback.jpg`,
        )
        metaHash = hash
        metaUrl = url
        promptHash = 'fallback_original_photo'
      }

      await persistAsset({
        propertyId: property.id,
        jobId: input.jobId,
        pieceIdx: i,
        photoIdx: realPhotoIdx,
        styleIdx: coords.styleIdx,
        format: coords.format,
        style: coords.style,
        metaHash,
        metaUrl,
        promptHash,
      })
      generated++
    } catch (err) {
      console.warn(`[async-runner] pieza ${i} falló:`, err)
      failures++
    }
  }

  // Recalcular total real (en caso de upserts que cuentan como existentes)
  const { count: nowDone } = await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string, opts: { count: 'exact'; head: boolean }) => {
        eq: (a: string, b: string) => Promise<{ count: number | null }>
      }
    }
  })
    .from('property_ad_assets')
    .select('id', { count: 'exact', head: true })
    .eq('launch_job_id', input.jobId)
  const totalGenerated = nowDone ?? 0
  const progressPercent = Math.min(100, Math.floor((totalGenerated / TOTAL_PIECES) * 100))
  const done = totalGenerated >= TOTAL_PIECES

  await updateJob(input.jobId, {
    status: done ? 'awaiting_confirm' : 'generating',
    progress_percent: progressPercent,
    current_step: done ? 'all_pieces_generated' : `batch_done_${endIdx}_of_${TOTAL_PIECES}`,
  })

  return {
    jobId: input.jobId,
    generatedInBatch: generated,
    totalGenerated,
    totalPieces: TOTAL_PIECES,
    progressPercent,
    done,
    failures,
  }
}

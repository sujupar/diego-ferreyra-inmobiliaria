/**
 * Diagnóstico (Fase 1 systematic-debugging): estado real de la campaña Meta de
 * Villa Pueyrredón. Correr: node --env-file=.env.local --import tsx scripts/audit-villa-pueyrredon-campaign.ts
 */
import { Client } from 'pg'

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  console.log('=== PROPIEDAD (Pueyrredón / monoambiente) ===')
  const props = await c.query(
    `SELECT id, title, address, neighborhood, public_slug, array_length(photos,1) AS n_photos
     FROM properties
     WHERE title ILIKE '%monoambiente%' OR address ILIKE '%pueyrred%' OR neighborhood ILIKE '%pueyrred%'
     ORDER BY created_at DESC LIMIT 5`,
  )
  console.table(props.rows)
  if (props.rows.length === 0) { await c.end(); return }
  const propId = props.rows[0].id as string

  console.log('\n=== meta_launch_jobs de esa propiedad ===')
  const jobs = await c.query(
    `SELECT id, status, current_step, progress_percent, result_campaign_id,
            daily_budget_ars, geo_preset_id, created_at
     FROM meta_launch_jobs WHERE property_id = $1 ORDER BY created_at DESC LIMIT 5`, [propId],
  )
  console.table(jobs.rows)

  console.log('\n=== property_ad_assets: formatos + hash presente, por job ===')
  const assetsByFmt = await c.query(
    `SELECT launch_job_id, format,
            COUNT(*) AS total,
            COUNT(meta_image_hash) FILTER (WHERE meta_image_hash IS NOT NULL AND meta_image_hash <> '') AS con_hash,
            COUNT(storage_url) FILTER (WHERE storage_url IS NOT NULL) AS con_storage
     FROM property_ad_assets WHERE property_id = $1
     GROUP BY launch_job_id, format ORDER BY launch_job_id, format`, [propId],
  )
  console.table(assetsByFmt.rows)

  console.log('\n=== muestra de filas property_ad_assets (últimas 15) ===')
  const sample = await c.query(
    `SELECT launch_job_id, format, composition_variant, photo_source_index,
            (meta_image_hash IS NOT NULL AND meta_image_hash <> '') AS tiene_hash,
            left(storage_url, 60) AS storage_url_corta, created_at
     FROM property_ad_assets WHERE property_id = $1 ORDER BY created_at DESC LIMIT 15`, [propId],
  )
  console.table(sample.rows)

  console.log('\n=== DISTINCT format en TODA la tabla (qué nombres usa cada generador) ===')
  const fmts = await c.query(
    `SELECT format, COUNT(*) FROM property_ad_assets GROUP BY format ORDER BY COUNT(*) DESC`,
  )
  console.table(fmts.rows)

  console.log('\n=== property_meta_campaigns de esa propiedad ===')
  const camps = await c.query(
    `SELECT campaign_id, status, adset_id,
            COALESCE(array_length(ad_ids,1),0) AS n_ads, last_error, created_at
     FROM property_meta_campaigns WHERE property_id = $1 ORDER BY created_at DESC LIMIT 5`, [propId],
  )
  console.table(camps.rows)

  await c.end()
}
main().catch((e) => { console.error(e); process.exit(1) })

/** Diagnóstico Roque Pérez / Conga (property + campaña + job). */
import { Client } from 'pg'

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  console.log('=== PROPIEDADES Roque Pérez / Conga ===')
  const p = await c.query(
    `SELECT id, title, address, neighborhood, property_type, operation_type, public_slug,
            array_length(photos,1) AS n_fotos
     FROM properties
     WHERE address ILIKE '%roque%' OR title ILIKE '%conga%' OR address ILIKE '%conga%' OR title ILIKE '%roque%'
     ORDER BY created_at DESC LIMIT 8`,
  )
  console.table(p.rows)
  for (const row of p.rows) {
    const camp = await c.query(
      `SELECT campaign_id, status, adset_id, COALESCE(array_length(ad_ids,1),0) AS n_ads, created_at
       FROM property_meta_campaigns WHERE property_id = $1 ORDER BY created_at DESC`, [row.id])
    const job = await c.query(
      `SELECT id, status, starred_photo_indices, selected_avatar_id, created_at
       FROM meta_launch_jobs WHERE property_id = $1 ORDER BY created_at DESC LIMIT 2`, [row.id])
    if (camp.rows.length || job.rows.length) {
      console.log(`\n--- ${row.title} (${row.id}) | tipo=${row.property_type} ---`)
      console.log('  campañas:', JSON.stringify(camp.rows))
      console.log('  jobs:', JSON.stringify(job.rows))
      const assets = await c.query(
        `SELECT launch_job_id, format, COUNT(*) AS n, COUNT(meta_image_hash) AS con_hash
         FROM property_ad_assets WHERE property_id = $1 GROUP BY launch_job_id, format`, [row.id])
      console.log('  assets:', JSON.stringify(assets.rows))
    }
  }
  await c.end()
}
main().catch((e) => { console.error(e.message); process.exit(1) })

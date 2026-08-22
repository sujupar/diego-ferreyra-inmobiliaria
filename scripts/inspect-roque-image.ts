/** Ver el avatar/hooks del job + descargar una imagen actual para ubicar el texto. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { Client } from 'pg'

const JOB = '6216f09b-5882-4a5b-a3e2-8c6fc6d2847f'
const PROP = '863b43c5-c107-4b9e-963d-8e9d6f8b4bb9'
const OUT = '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/ac7949b2-002a-4fb2-a997-01cbf673a880/scratchpad/roque'

async function main() {
  mkdirSync(OUT, { recursive: true })
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const job = await c.query(`SELECT optimized_avatar FROM meta_launch_jobs WHERE id=$1`, [JOB])
  console.log('=== optimized_avatar (hooks/shortLabel) ===')
  const av = job.rows[0]?.optimized_avatar
  console.log(JSON.stringify(av?.hooks ?? av?.shortLabel ?? av, null, 1)?.slice(0, 800))
  const a = await c.query(
    `SELECT format, photo_source_index, composition_variant, storage_url, meta_image_hash
     FROM property_ad_assets WHERE launch_job_id=$1 AND format='feed_vertical' ORDER BY photo_source_index, composition_variant LIMIT 2`, [JOB])
  await c.end()
  for (const row of a.rows) {
    if (!row.storage_url) { console.log('sin storage_url', row.format); continue }
    const res = await fetch(row.storage_url)
    if (!res.ok) { console.log('no se pudo bajar', res.status); continue }
    const buf = Buffer.from(await res.arrayBuffer())
    const p = `${OUT}/actual_p${row.photo_source_index}_s${row.composition_variant}.jpg`
    writeFileSync(p, buf)
    console.log(`✓ ${p} (${(buf.length / 1024).toFixed(0)} KB)`)
  }
}
main().catch((e) => { console.error(e.message); process.exit(1) })

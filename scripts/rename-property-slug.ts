/**
 * Renombra el enlace público de una propiedad SIN matar el anterior.
 *
 * Caso de uso real: el slug se arma con el tipo de propiedad y queda congelado
 * al publicar. Si el tipo estaba mal cargado (Roque Pérez decía "departamento"
 * siendo una casa), el enlace público miente — pero ya vive dentro de anuncios
 * pagos, mensajes y mails. Este script pone el slug correcto y deja el viejo
 * como alias, para que siga entrando y redirija al nuevo.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/rename-property-slug.ts <idOPatron> [slugNuevo] [--commit]
 *
 * Sin `--commit` NO escribe nada: muestra exactamente qué haría.
 * Sin `slugNuevo`, lo deriva del slug actual reemplazando la primera palabra
 * (el tipo) por el `property_type` vigente y conservando TODO lo demás,
 * incluido el sufijo aleatorio — así el enlace nuevo es el mismo salvo la
 * palabra corregida.
 */
import { createClient } from '@supabase/supabase-js'
import { planRenombreDeSlug } from '../lib/landing/slug-alias'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function kebab(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Reemplaza la primera palabra del slug (el tipo) por el tipo vigente. */
export function derivarSlugConTipo(slugActual: string, propertyType: string): string {
  const tipo = kebab(propertyType)
  if (!tipo) return slugActual
  const i = slugActual.indexOf('-')
  return i === -1 ? tipo : `${tipo}${slugActual.slice(i)}`
}

async function main() {
  const [patron, ...resto] = process.argv.slice(2)
  const commit = resto.includes('--commit')
  const slugPedido = resto.find(a => !a.startsWith('--'))
  if (!patron) { console.error('Falta el id o un patrón de dirección.'); process.exit(1) }

  const esUuid = /^[0-9a-f-]{36}$/i.test(patron)
  const { data: props } = esUuid
    ? await sb.from('properties').select('id, address, property_type, public_slug, previous_slugs, status').eq('id', patron)
    : await sb.from('properties').select('id, address, property_type, public_slug, previous_slugs, status').ilike('address', `%${patron}%`)

  if (!props?.length) { console.error('No se encontró ninguna propiedad.'); process.exit(1) }
  if (props.length > 1) {
    console.error('El patrón encontró varias propiedades. Precisá el id:')
    for (const p of props) console.error(`  ${p.id}  ${p.address}`)
    process.exit(1)
  }

  const p = props[0] as {
    id: string; address: string; property_type: string
    public_slug: string | null; previous_slugs: string[] | null; status: string
  }
  const nuevo = slugPedido ?? derivarSlugConTipo(p.public_slug ?? '', p.property_type)
  const plan = planRenombreDeSlug(p.public_slug, nuevo, p.previous_slugs ?? [])

  console.log(`Propiedad: ${p.address} (${p.property_type}, ${p.status})`)
  console.log(`  enlace actual: ${p.public_slug ?? '—'}`)
  if (!plan) { console.log('  → nada que hacer: el enlace ya es el correcto.'); return }
  console.log(`  enlace nuevo:  ${plan.public_slug}`)
  console.log(`  alias que seguirán entrando: ${plan.previous_slugs.join(', ') || '—'}`)

  if (!commit) { console.log('\n(simulación — agregá --commit para aplicarlo)'); return }

  const { error: e1 } = await sb.from('properties')
    .update({ public_slug: plan.public_slug, previous_slugs: plan.previous_slugs } as never)
    .eq('id', p.id)
  if (e1) { console.error('ERROR al actualizar la propiedad:', e1.message); process.exit(1) }

  // La landing guarda su propia copia del slug y una utm_base congelada al
  // publicar. Se actualizan para que no queden apuntando al enlace viejo.
  const { data: landing } = await sb.from('property_landings')
    .select('utm_base').eq('property_id', p.id).maybeSingle()
  const utm = (landing?.utm_base ?? null) as Record<string, string> | null
  const utmNuevo = utm
    ? {
        ...utm,
        base_url: typeof utm.base_url === 'string'
          ? utm.base_url.replace(/\/p\/[^/?#]+$/, `/p/${plan.public_slug}`) : utm.base_url,
        utm_campaign: typeof utm.utm_campaign === 'string' && p.public_slug
          ? utm.utm_campaign.replace(p.public_slug, plan.public_slug) : utm.utm_campaign,
      }
    : null

  const { error: e2 } = await sb.from('property_landings')
    .update({
      public_slug: plan.public_slug,
      published_slug: plan.public_slug,
      ...(utmNuevo ? { utm_base: utmNuevo } : {}),
    } as never)
    .eq('property_id', p.id)
  if (e2) console.warn('AVISO: la propiedad se actualizó pero la landing no:', e2.message)

  console.log('\n✔ aplicado. El enlace viejo redirige al nuevo conservando los utm_*.')
}

main()

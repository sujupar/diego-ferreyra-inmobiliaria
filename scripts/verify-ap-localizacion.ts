/**
 * Verificador EN VIVO de la resolución de localización de Argenprop.
 * No crea ni toca avisos. (No es 100% lectura: como toda llamada al cliente de
 * AP, puede hacer el POST de login y refrescar el token cacheado en
 * portal_credentials — efecto normal e inocuo de la autenticación.)
 *
 * Ejercita `resolveLocalizacion` (el método real del adapter) con casos fijos
 * que cubren los dos caminos: CABA (barrio obligatorio) y provincia →
 * partido → localidad (lo habilitado el 2026-08-06). Correr ante cualquier
 * cambio del resolver o del matcher — los catálogos son datos de un tercero.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/verify-ap-localizacion.ts
 */
import { createClient } from '@supabase/supabase-js'
import { resolveCredentials } from '../lib/portals/credentials'
import { ArgenpropAdapter } from '../lib/portals/argenprop/adapter'
import type { Property } from '../lib/portals/types'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const CASOS: { nombre: string; ficha: Partial<Property>; espera: (r: { localidadId: string; barrioId: string | null }) => string | null }[] = [
  {
    nombre: 'CABA + Palermo (camino histórico)',
    ficha: { province: 'CABA', city: 'CABA', neighborhood: 'Palermo' },
    espera: r => r.localidadId === 'LOCALIDAD_2102' && r.barrioId ? null : 'esperaba localidad 2102 + barrio',
  },
  {
    nombre: 'Buenos Aires + Roque Pérez (el caso real del negocio)',
    ficha: { province: 'Buenos Aires', city: 'Roque Pérez', neighborhood: null as never },
    espera: r => r.localidadId.startsWith('LOCALIDAD_') && r.localidadId !== 'LOCALIDAD_2102' ? null : 'esperaba una localidad de provincia',
  },
  {
    nombre: 'Buenos Aires + La Plata',
    ficha: { province: 'Buenos Aires', city: 'La Plata', neighborhood: null as never },
    espera: r => r.localidadId.startsWith('LOCALIDAD_') && r.localidadId !== 'LOCALIDAD_2102' ? null : 'esperaba una localidad de provincia',
  },
]

async function main() {
  const c = await resolveCredentials('argenprop', { env: process.env, supabase: sb() as never })
  if (!c.ap) { console.error('Faltan credenciales ARGENPROP_*'); process.exit(1) }

  const adapter = new ArgenpropAdapter(true)
  ;(adapter as unknown as { creds: unknown }).creds = c.ap
  const resolver = (p: Property) =>
    (adapter as unknown as { resolveLocalizacion(p: Property): Promise<{ localidadId: string; barrioId: string | null }> })
      .resolveLocalizacion(p)

  let fallas = 0
  for (const caso of CASOS) {
    try {
      const r = await resolver(caso.ficha as Property)
      const problema = caso.espera(r)
      if (problema) {
        fallas++
        console.log(`✘ ${caso.nombre} → ${JSON.stringify(r)} — ${problema}`)
      } else {
        console.log(`✔ ${caso.nombre} → localidad ${r.localidadId}, barrio ${r.barrioId ?? '(sin barrio, OK fuera de CABA)'}`)
      }
    } catch (e) {
      fallas++
      console.log(`✘ ${caso.nombre} → ERROR: ${e instanceof Error ? e.message : e}`)
    }
  }

  if (fallas > 0) { console.log(`\n❌ ${fallas} caso(s) fallaron`); process.exit(1) }
  console.log('\n✅ la resolución de localización funciona contra el catálogo real')
}

main()

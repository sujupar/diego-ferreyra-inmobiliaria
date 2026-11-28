/**
 * Semilla de cuentas del radar de referencias de Instagram (`radar_cuentas`, origen 'semilla').
 *
 * La lista NO se arma sola: cada cuenta se verificó EN VIVO el 2026-11-28 con el navegador
 * del robot (`perfil()` + `reelsDeCuenta(perfil, 6)`): existe, es pública, publica reels
 * y —las inmobiliarias— es de Argentina (bio/textos en rioplatense, ciudades de AR).
 * Fuentes: búsquedas de `radar_busquedas`, cuentas conocidas del mercado argentino y la
 * cantera ⭐ de `~/.openclaw/workspace/diego-data/formatos/_creadores-referencia.md`.
 *
 * Idempotente: `on conflict do nothing` (una cuenta que ya está —activa o desactivada a
 * mano— no se toca). Imprime la lista para que Julián la revise.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/seed-radar-cuentas.ts
 */
import { supabaseAdmin } from '../radar/db'

interface Semilla {
  usuario: string
  rubro: 'inmobiliario' | 'otro'
  /** Por qué está, en una línea (para revisarla). */
  porque: string
}

export const SEMILLAS: Semilla[] = [
  // Inmobiliarias / mercado inmobiliario argentino
  { usuario: 'toribioachaval', rubro: 'inmobiliario', porque: "inmobiliaria tradicional de CABA (70 años); reels de barrios y casas" },
  { usuario: 'zonaprop', rubro: 'inmobiliario', porque: "portal argentino; reels con análisis de mercado (sobreoferta, precios) con referentes" },
  { usuario: 'argenprop', rubro: 'inmobiliario', porque: "portal argentino; reels de barrios de Buenos Aires para quien compra o alquila" },
  { usuario: 'juanmanueltapiola', rubro: 'inmobiliario', porque: "divulgador AR de acceso a la vivienda (+1M seguidores); la cuenta que mejor ejecuta el ángulo dueño" },
  { usuario: 'grupobriones', rubro: 'inmobiliario', porque: "desarrolladora de CABA; su outlier 'Dueños de deptos Argentina' está en la cantera ⭐" },
  { usuario: 'beltran.real.estate', rubro: 'inmobiliario', porque: "presidente de Grupo Briones; desarrollador en Buenos Aires, cantera ⭐" },
  { usuario: 'inmobiliaria.marcela.genta', rubro: 'inmobiliario', porque: "corredora de Villa Urquiza/Palermo (CABA); cantera ⭐ 'ganadora real'" },
  { usuario: 'irenevitalonipropiedades', rubro: 'inmobiliario', porque: "martillera CUCICBA (CABA/Zona Norte), créditos hipotecarios paso a paso; cantera ⭐ (último reel abril 2026)" },
  { usuario: 'martilleropro', rubro: 'inmobiliario', porque: "leyes, impuestos y datos del mercado argentino explicados simple; casos de alquiler con números" },
  { usuario: 'diegosgalla.edinmobiliaria', rubro: 'inmobiliario', porque: "educación inmobiliaria AR: errores al publicar, PH, cómo vender/comprar" },
  { usuario: 'gaedinmobiliaria', rubro: 'inmobiliario', porque: "inmobiliaria de Villa Crespo (CABA); reels de precio y tasación para propietarios" },
  { usuario: 'ricciprop', rubro: 'inmobiliario', porque: "inmobiliaria AR; reels de tasación ('dos inmobiliarias te dieron dos precios') y Palermo" },
  { usuario: 'javierpeonremax', rubro: 'inmobiliario', porque: "agente RE/MAX UNO (CUCICBA); alertas de crédito hipotecario y recorridos en CABA" },
  { usuario: 'juan.santander.prop', rubro: 'inmobiliario', porque: "martillero de CABA; regularización de ampliaciones no declaradas, Palermo" },
  { usuario: 'vendebuenosaires', rubro: 'inmobiliario', porque: "asesora inmobiliaria en CABA (Recoleta, Palermo); fichas con precio en USD" },
  { usuario: 'mauriciosorrentoremax', rubro: 'inmobiliario', porque: "agente RE/MAX Raíces en Buenos Aires; consejos antes de vender" },
  { usuario: 'federojel', rubro: 'inmobiliario', porque: "agente del corredor norte de CABA; vender en menos de 60 días" },
  { usuario: 'darenapropiedades', rubro: 'inmobiliario', porque: "inmobiliaria CUCICBA de CABA; alquileres y ventas (Puerto Madero)" },
  { usuario: 'germaninmo', rubro: 'inmobiliario', porque: "abogado y vendedor de propiedades porteño; humor y casos legales de la operación" },
  { usuario: 'rafasmithe', rubro: 'inmobiliario', porque: "'La Máquina del Real Estate', alta gama Buenos Aires + Punta del Este; cantera" },
  { usuario: 'ykonosdesarrollos', rubro: 'inmobiliario', porque: "desarrolladora en Villa Urquiza (CABA), departamentos en cuotas (último reel julio 2026)" },
  { usuario: 'munozbienesraicesarg', rubro: 'inmobiliario', porque: "pozo financiado en CABA/Zona Norte (CUCICBA); financiación en dólares" },
  { usuario: 'brusiprop', rubro: 'inmobiliario', porque: "inmobiliaria de zona sur GBA (CUCICBA/CPMCLZ); 'querés vender tu propiedad?'" },
  { usuario: 'fazioprop', rubro: 'inmobiliario', porque: "inmobiliaria de Zona Sur GBA; herencias y marketing para vender" },
  { usuario: 'elena.financiera', rubro: 'inmobiliario', porque: "economista argentina; crédito hipotecario, recesión, finanzas personales" },
  { usuario: 'agonprop', rubro: 'inmobiliario', porque: "proptech argentina (tasador, portales); estafas con escribanos, comparativa de portales" },
  { usuario: 'inmobiliariosenredes.ar', rubro: 'inmobiliario', porque: "comunidad del mercado inmobiliario argentino: tips, noticias y herramientas" },
  { usuario: 'arcomercialarg', rubro: 'inmobiliario', porque: "software de administración inmobiliaria AR desde 2007; contenido para inmobiliarias" },
  { usuario: 'estudioplanta.ar', rubro: 'inmobiliario', porque: "estudio de Berazategui; lotes que se pagan con alquileres (ángulo inversión en vivienda)" },
  { usuario: 'etchegorrybienesraices', rubro: 'inmobiliario', porque: "inmobiliaria de Mar del Plata (89k); fichas de casas en venta" },
  { usuario: 'lucascanabal.remax', rubro: 'inmobiliario', porque: "'El Pelado Inmobiliario', Mar del Plata (69k); vender en menos de 60 días (último reel agosto 2026)" },
  { usuario: 'lebedpropiedades', rubro: 'inmobiliario', porque: "martillera de Bahía Blanca; el día a día de una martillera y el proceso de venta" },
  { usuario: 'agustinkreiber', rubro: 'inmobiliario', porque: "martillero de Río Negro/Bs As (24k); ventas y tasaciones" },
  { usuario: 'theainmobiliaria', rubro: 'inmobiliario', porque: "inmobiliaria de Entre Ríos (CCPER); visitas, fotos y lotes" },
  { usuario: 'devenirpropiedades', rubro: 'inmobiliario', porque: "inmobiliaria de Córdoba (Marcos Juárez, 12k); loteos e inversión" },
  { usuario: 'fedunnegociosinmobiliarios', rubro: 'inmobiliario', porque: "martillero de Neuquén; departamentos en venta (último reel mayo 2026)" },
  // Otros rubros: moldes de formato de la cantera ⭐ (verificados en Instagram)
  { usuario: 'nexestates', rubro: 'otro', porque: "⭐ cantera: '¿Quién paga?' propietario vs inquilino (España); molde de veredicto rápido" },
  { usuario: 'alexandracracco', rubro: 'otro', porque: "⭐ cantera: autoridad insider + conceptos bautizados (finanzas, long-form)" },
  { usuario: 'alexandramarinbr', rubro: 'otro', porque: "⭐ cantera: 'Top 3 errores' con plata concreta (bienes raíces, Colombia; último reel abril 2026)" },
  { usuario: 'superpropietarios.co', rubro: 'otro', porque: "⭐ cantera: secuencia/proceso para comprar vivienda (Colombia; último reel marzo 2026)" },
  { usuario: 'diasconsofia', rubro: 'otro', porque: "⭐ cantera: listicle de prioridades + serie (hogar, Colombia; último reel marzo 2026)" },
]

async function main() {
  const usuarios = SEMILLAS.map((s) => s.usuario)
  if (new Set(usuarios).size !== usuarios.length) throw new Error('hay usuarios repetidos en SEMILLAS')
  for (const u of usuarios) if (u !== u.toLowerCase().replace(/^@/, '').trim()) throw new Error(`usuario mal escrito: ${u}`)

  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('radar_cuentas')
    .upsert(
      SEMILLAS.map((s) => ({ usuario: s.usuario, origen: 'semilla', rubro: s.rubro })),
      { onConflict: 'usuario', ignoreDuplicates: true },
    )
    .select('usuario')
  if (error) throw new Error(`no se pudo insertar en radar_cuentas: ${error.message}`)
  const nuevas = new Set(((data ?? []) as Array<{ usuario: string }>).map((f) => f.usuario))

  for (const rubro of ['inmobiliario', 'otro'] as const) {
    const grupo = SEMILLAS.filter((s) => s.rubro === rubro)
    console.log(`\n${rubro.toUpperCase()} (${grupo.length})`)
    for (const s of grupo) console.log(`  ${nuevas.has(s.usuario) ? '+' : '='} @${s.usuario} — ${s.porque}`)
  }
  console.log(`\nInsertadas: ${nuevas.size} de ${SEMILLAS.length} (= ya estaba, no se tocó).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

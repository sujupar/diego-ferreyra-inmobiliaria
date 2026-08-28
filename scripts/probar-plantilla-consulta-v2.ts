/**
 * Manda UN aviso de prueba con `consulta_portal_v2` para ver el botón en el
 * teléfono. No toca Netlify ni la configuración: usa la plantilla directo.
 *
 * Arma el link corto de verdad (mismo camino que una consulta real) apuntando al
 * número que recibe la prueba, así al tocar el botón se abre un chat con el
 * saludo precargado y se puede comprobar el recorrido entero.
 *
 * Los datos van marcados como PRUEBA a propósito: si esto llega a un teléfono
 * del equipo, tiene que ser obvio de un vistazo que no hay ningún cliente
 * esperando respuesta.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/probar-plantilla-consulta-v2.ts <telefono>
 */
import { Client } from 'pg'
import { sendWhatsappTemplate } from '../lib/integrations/whatsapp/core'
import { generarCodigo, urlCorta } from '../lib/links/short-link'
import { variantesDeSaludo, armarLinkRespuesta } from '../lib/integrations/portal-inquiries/reply-link'

const TEMPLATE = 'consulta_portal_v2'
const LANG = process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_AR'
const AVISO = 'https://www.zonaprop.com.ar/propiedades/clasificado/duplex-4-ambientes-59885245.html'

async function main() {
  // El teléfono se pasa YA en E.164 sin '+' (ej. 573107822955), a propósito:
  // `normalizePhone` usa libphonenumber-js/max, cuya metadata no carga bajo tsx
  // (revienta con "Cannot read properties of undefined"). En la app corre sobre
  // el bundler de Next y anda perfecto — es solo este runner. Como esto es un
  // script manual, alcanza con validar la forma.
  const destino = (process.argv[2] ?? '').replace(/^\+/, '')
  if (!/^\d{8,15}$/.test(destino)) {
    throw new Error(`Pasá el teléfono en E.164 sin '+', ej. 573107822955. Recibí: ${process.argv[2] ?? '(nada)'}`)
  }

  const saludos = variantesDeSaludo({
    leadName: 'PRUEBA',
    advisorName: 'Diego Ferreyra',
    propertyLabel: 'Entre Ríos 2300',
    avisoUrl: AVISO,
  })
  // El link apunta al MISMO número que recibe la prueba: al tocar el botón se
  // abre un chat con el saludo escrito y se ve el recorrido completo.
  const largo = armarLinkRespuesta(destino, saludos, Infinity)

  const c = new Client({ host:'aws-0-us-west-2.pooler.supabase.com', port:5432,
    user:'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database:'postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()
  const code = generarCodigo()
  await c.query('INSERT INTO short_links (code,target_url,source) VALUES ($1,$2,$3)', [code, largo, 'prueba-boton'])
  await c.end()

  const corto = urlCorta(code)
  const bodyParams = [
    'PRUEBA', '0', 'ZonaProp', 'Mail', 'Entre Ríos 2300 (PRUEBA)',
    AVISO, 'PRUEBA — ignorar este aviso', '573107822955', 'prueba@ejemplo.com', corto,
  ]

  console.log(`Mandando "${TEMPLATE}" a ${destino}`)
  console.log(`  link corto : ${corto}`)
  console.log(`  botón      : código "${code}" → ${corto}`)
  const r = await sendWhatsappTemplate({
    to: destino,
    templateName: TEMPLATE,
    languageCode: LANG,
    bodyParams,
    urlButtonParam: code,
  })
  console.log('\nRespuesta de Meta:', JSON.stringify(r, null, 2))
  if (!r.ok) {
    console.log('\n❌ No se pudo enviar. Si dice que el componente de botón no corresponde,')
    console.log('   la plantilla todavía no está aprobada o no tiene el botón declarado.')
    process.exit(1)
  }
  if (r.skipped) { console.log('\n⚠️  Modo prueba activo (WHATSAPP_TEST_MODE): NO se envió de verdad.'); return }
  console.log('\n✅ Enviado. Revisá el teléfono: tiene que verse el botón "Responder al interesado".')
  console.log('   Tocalo y debería abrir el chat con el saludo y el enlace del portal ya escritos.')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })

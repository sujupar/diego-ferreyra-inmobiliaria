/**
 * Probe del email "Informes quincenales listos para completar": renderiza y verifica estructura, links y que una
 * dirección con caracteres raros salga escapada. No manda nada.
 *   node --import tsx scripts/informes-quincenales-email.probe.tsx
 */
import { render } from '@react-email/components'
import InformesQuincenalesEmail from '../emails/InformesQuincenalesEmail'

async function main() {
  const html = await render(InformesQuincenalesEmail({
    periodo: 'del 16 al 31 de octubre de 2026',
    informes: [
      { direccion: 'Roque Pérez 3059', url: 'https://inmodf.com.ar/informes/a' },
      { direccion: 'Entre Ríos <b>2333</b>', url: 'https://inmodf.com.ar/informes/b' },
    ],
    listadoUrl: 'https://inmodf.com.ar/informes',
  }))
  const chequeos: Array<[string, boolean]> = [
    ['título', html.includes('Informes quincenales listos para completar')],
    ['cuenta los informes', html.includes('los 2 informes')],
    ['período', html.includes('del 16 al 31 de octubre de 2026')],
    ['link a cada informe', html.includes('href="https://inmodf.com.ar/informes/a"') && html.includes('href="https://inmodf.com.ar/informes/b"')],
    ['botón al listado', html.includes('href="https://inmodf.com.ar/informes"')],
    ['la dirección se escapa (sin HTML inyectado)', html.includes('&lt;b&gt;2333&lt;/b&gt;') && !html.includes('<b>2333</b>')],
  ]
  for (const [nombre, ok] of chequeos) console.log(ok ? '✓' : '✗', nombre)
  if (chequeos.some(([, ok]) => !ok)) process.exit(1)
}
main()

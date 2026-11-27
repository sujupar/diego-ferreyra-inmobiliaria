import { vcardDePaula } from '@/lib/video-bienvenida/contenido'

/**
 * "Guardar el contacto de Paula" (página del video de bienvenida). Una tarjeta de contacto para
 * que, cuando suene el teléfono, la persona sepa que es la inmobiliaria. La carpeta fija
 * `paula.vcf` le gana a `[codigo]` en el ruteo de Next.
 */
export function GET() {
  return new Response(vcardDePaula(), {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      // `inline`: en iPhone abre la hoja "Agregar contacto" en vez de bajar un archivo suelto
      // (auditoría de código, hallazgo 10). Android lo ofrece abrir con Contactos igual.
      'Content-Disposition': 'inline; filename="Paula - Diego Ferreyra Inmobiliaria.vcf"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

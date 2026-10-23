/**
 * react-pdf solo dibuja JPEG y PNG. Las fotos de los portales llegan en webp (Argenprop y MercadoLibre) y quedaban
 * en blanco en el PDF, con un "Base64 image invalid format: webp" en la consola (vista previa, 2026-10-22).
 */
export function pdfPuedeDibujar(dataUrl: string): boolean {
  return /^data:image\/(jpe?g|png)[;,]/i.test(dataUrl)
}

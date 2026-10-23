'use client'
/**
 * Genera el PDF del informe EN EL NAVEGADOR (como el de tasación): las fuentes de Poppins vienen de
 * Google Fonts y las imágenes de la marca de `public/informe-quincenal/`. Las capturas (bucket
 * privado, URL firmada) y las fotos de las competidoras (portales) se pasan a data URL por
 * `/api/proxy-image`: react-pdf no puede leer imágenes de otro dominio por CORS.
 *
 * Una imagen que no se pudo traer queda en null y la página cae a su versión sin imagen (tarjetas
 * con números, recuadro gris): nunca frena el PDF.
 */
import { pdf } from '@react-pdf/renderer'
import { convertUrlToBase64 } from '@/lib/pdf/imageUtils'
import { pdfPuedeDibujar } from '@/lib/informes/formato-imagen'
import type { VistaInforme } from '@/lib/informes/servicio'
import type { NombreCaptura } from '@/lib/informes/tipos'
import { InformePDF } from './InformePDF'

/** Redibuja la imagen en un canvas y la devuelve en JPEG (el navegador sí lee webp; react-pdf no). */
function aJpeg(dataUrl: string): Promise<string | null> {
  return new Promise(ok => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width) return ok(null)
      ctx.drawImage(img, 0, 0)
      ok(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => ok(null)
    img.src = dataUrl
  })
}

async function comoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  const r = await convertUrlToBase64(url)
  if (!r) return null
  return pdfPuedeDibujar(r) ? r : aJpeg(r)
}

export async function generarPdfDelInforme(v: Omit<VistaInforme, 'faltantes' | 'pdfUrl'>): Promise<Blob> {
  const capturas: Partial<Record<NombreCaptura, string>> = {}
  const entradas = Object.entries(v.capturasUrl) as Array<[NombreCaptura, string]>
  const [convertidas, competidoras] = await Promise.all([
    Promise.all(entradas.map(([, url]) => comoDataUrl(url))),
    Promise.all(v.informe.competidoras.map(c => comoDataUrl(c.foto))),
  ])
  entradas.forEach(([cual], i) => {
    const dataUrl = convertidas[i]
    if (dataUrl) capturas[cual] = dataUrl
  })
  return pdf(
    <InformePDF d={{
      informe: v.informe, propiedad: v.propiedad, resumen: v.resumen, paginas: v.paginas,
      imagenes: { capturas, competidoras }, base: `${window.location.origin}/informe-quincenal`,
    }} />,
  ).toBlob()
}

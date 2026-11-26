import { FormCoordinarTasacion } from '@/components/pipeline/FormCoordinarTasacion'

// Componente de SERVIDOR que lee la dirección y le pasa dos textos al formulario
// (crm-ficha-y-llamadas, D9). No se usa `useSearchParams` en el cliente: en Next 16 ese
// hook obliga a un <Suspense>, y como el build local no corre (la tilde de la carpeta
// rompe Turbopack), el fallo aparecería recién en Netlify.
const unTexto = (v: string | string[] | undefined): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

export default async function AgendarTasacionPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string | string[]; contact?: string | string[] }>
}) {
  const sp = await searchParams
  const dealId = unTexto(sp.deal)
  // Con los dos, manda el proceso: la ruta rechaza recibir ambos (400).
  const contactId = dealId ? null : unTexto(sp.contact)
  return <FormCoordinarTasacion dealId={dealId} contactId={contactId} />
}

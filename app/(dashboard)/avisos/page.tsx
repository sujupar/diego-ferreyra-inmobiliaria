import { redirect } from 'next/navigation'

/**
 * "Avisos por identificar" se sacó el 2026-10-30 (decisión del dueño): los
 * avisos se conectan solo desde Consultas, viendo el aviso y eligiendo nuestra
 * propiedad y quién la muestra. Esta dirección queda para los enlaces viejos y
 * abre esa hoja. Quién puede abrirla lo decide `/consultas` (y la ruta de datos).
 */
export default function AvisosPage() {
  redirect('/consultas?avisos=1')
}

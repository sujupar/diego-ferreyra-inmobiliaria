import { construirInstante, formatearFechaLarga } from '@/lib/visitas/horario'

interface DatosConfirmacion {
  /** Dígitos con código de país y sin "+", ej. 5491161400496. */
  whatsapp: string
  nombre: string | null
  direccion: string
  /** AAAA-MM-DD */
  fecha: string
  /** HH:MM */
  hora: string
}

function primerNombre(nombre: string | null): string {
  const palabra = (nombre ?? '').normalize('NFC').trim().split(/\s+/)[0] ?? ''
  if (!palabra) return ''
  return palabra.charAt(0).toLocaleUpperCase('es-AR') + palabra.slice(1).toLocaleLowerCase('es-AR')
}

/**
 * Día y mes en castellano ("viernes 30 de octubre"). `formatearFechaLarga`
 * trae la hora pegada al final; acá la hora se dice aparte ("a las 15:00"),
 * así que se la saca para no repetirla. Fecha inexistente: el texto crudo,
 * porque un enlace con la fecha mal escrita es mejor que ninguno.
 */
function fechaEnPalabras(fecha: string, hora: string): string {
  const instante = construirInstante(fecha, hora)
  if (!instante) return fecha
  return formatearFechaLarga(instante).replace(/,\s*\d{1,2}:\d{2}$/, '')
}

/** Enlace de WhatsApp con el mensaje armado; el asesor decide si lo manda. */
export function enlaceConfirmacion(d: DatosConfirmacion): string {
  const nombre = primerNombre(d.nombre)
  const saludo = nombre ? `Hola ${nombre}!` : 'Hola!'
  const texto = `${saludo} Te confirmo la visita a ${d.direccion} el ${fechaEnPalabras(d.fecha, d.hora)} a las ${d.hora}. Cualquier cosa me escribís por acá.`
  const numero = d.whatsapp.replace(/\D/g, '')
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

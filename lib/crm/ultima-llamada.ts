// Estado de la última llamada de la cabecera de la ficha (design.md D2). Puro.
// `ultimaEn` es de la PERSONA (cualquier proceso), lo arma la ruta `ficha`; este módulo
// solo lo convierte en texto y decide la alerta.
import { diasDeCalendarioEntre } from './horario-laboral'

export interface UltimaLlamada {
  texto: string
  dias: number | null
  alerta: boolean
}

const DIAS_PARA_ALERTA = 2

/**
 * Cuenta días de calendario de Argentina (una llamada de las 23:30 vista a las 00:30 es
 * "ayer"). La alerta va solo en Solicitud: sin llamar, o con la última hace 2 días o más.
 * `etapaCRM` es la etapa del CRM del proceso activo (`solicitud`, `coordinada`…).
 */
export function ultimaLlamada(ultimaEn: string | null, ahora: Date, etapaCRM: string | null): UltimaLlamada {
  const enSolicitud = etapaCRM === 'solicitud'
  if (!ultimaEn) return { texto: 'Sin llamar todavía', dias: null, alerta: enSolicitud }
  // Un desfase de relojes puede dejarla unos segundos en el futuro: cuenta como hoy.
  const dias = Math.max(0, diasDeCalendarioEntre(new Date(ultimaEn), ahora))
  const texto = dias === 0 ? 'Última llamada: hoy' : dias === 1 ? 'Última llamada: ayer' : `Última llamada: hace ${dias} días`
  return { texto, dias, alerta: enSolicitud && dias >= DIAS_PARA_ALERTA }
}

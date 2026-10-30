/**
 * Tipos de la bandeja de Consultas. Los comparten las reglas puras
 * (`filtros.ts`, `bandeja.ts`), la ruta `GET /api/consultas` y la pantalla.
 *
 * `ConsultaFila` es EXACTAMENTE una fila de la vista `consultas_unificadas`
 * (consultas de portales + registros de landings en una sola forma). Si la vista
 * cambia una columna, se cambia acá y TypeScript marca a cada consumidor.
 * Módulo puro y seguro para el navegador.
 */
import type { TelefonoLeido } from './telefono'
import type { EstadoVisita } from '@/lib/visitas/transiciones'

export interface ConsultaFila {
  id: string
  tipo: 'portal' | 'landing'
  numero: number | null
  recibida_at: string
  canal: 'whatsapp' | 'mail' | 'landing'
  portal: string
  nombre: string | null
  telefono: string | null
  email: string | null
  mensaje: string | null
  property_id: string | null
  assigned_to: string | null
  asesor_propiedad: string | null
  aviso_codigo: string | null
  aviso_url: string | null
  aviso_direccion: string | null
  aviso_titulo: string | null
  utm: unknown
}

/** Lo mínimo de una visita para saber si una consulta ya tiene la suya. */
export interface VisitaDeConsulta {
  id: string
  property_id: string
  portal_inquiry_id: string | null
  /** El comprador (`property_leads.id`); en una consulta de landing es el id de la consulta. */
  lead_id: string | null
  client_phone: string | null
  status: EstadoVisita
  scheduled_at: string
}

export type EstadoConsulta =
  | { tipo: 'sin_visita' }
  | { tipo: 'con_visita' | 'visito'; visitaId: string; scheduled_at: string }

/** Qué ofrece el botón "Agendar visita" de cada consulta. */
export type AccionAgendar = 'agendar' | 'elegir_propiedad' | 'revisar_telefono' | 'pedir_telefono'

export interface ConsultaEnBandeja extends ConsultaFila {
  estado: EstadoConsulta
  tel: TelefonoLeido
  repetidas: number
  accion: AccionAgendar
  propiedad: { address: string; neighborhood: string | null } | null
  asesor_nombre: string | null
}

export interface TarjetasBandeja {
  sinVisita: number
  sinPropiedad: number
  telefonoRevisar: number
}

export interface ConteoOpcion {
  valor: string
  etiqueta: string
  n: number
}

/**
 * Lo que viaja del servidor a la pantalla: el período ENTERO, con cada consulta
 * ya decidida (estado, teléfono, acción, propiedad, asesor). Filtrar, paginar y
 * calcular las estadísticas pasa en la pantalla, sin volver a pedir nada: cada
 * pedido a la plataforma cuesta ~1 s de piso (spec Entrega 2 §2).
 */
export interface PeriodoConsultas {
  periodo: { desde: string; hasta: string; etiqueta: string }
  consultas: ConsultaEnBandeja[]
  /**
   * `true` si el período tenía más consultas de las que viajan (las más nuevas
   * primero): los totales son de lo traído y la pantalla tiene que decirlo.
   */
  truncado: boolean
}

/** Lo que muestra la Bandeja con los filtros puestos (lib/consultas/vista.ts). */
export interface VistaBandeja {
  /** Las primeras `visibles` del resultado filtrado. */
  filas: ConsultaEnBandeja[]
  total: number
  tarjetas: TarjetasBandeja
  porPortal: ConteoOpcion[]
  porPropiedad: ConteoOpcion[]
}

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

export interface RespuestaBandeja {
  filas: ConsultaEnBandeja[]
  total: number
  pagina: number
  porPagina: 25
  tarjetas: TarjetasBandeja
  porPortal: ConteoOpcion[]
  porPropiedad: ConteoOpcion[]
  periodo: { desde: string; hasta: string; etiqueta: string }
  /**
   * Solo presente (y `true`) si la base tenía más consultas de las que se leen
   * en un pedido (20.000): los totales y conteos son de lo leído, no del período
   * entero, y la pantalla tiene que poder decirlo.
   */
  truncado?: true
}

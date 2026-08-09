import type { LocationInsights } from '@/lib/marketing/location-insights'

/**
 * La forma MÍNIMA de los datos que el generador de descripciones necesita.
 *
 * POR QUÉ existe: `generatePortalDescription` no toca la base — solo LEE estos
 * campos de un objeto plano (ver `buildUserPayload`). Pedirle una fila entera de
 * `properties` obligaba a que la propiedad YA EXISTIERA, y en el alta manual
 * todavía no existe. La alternativa ("guardar primero, generar después") se
 * descartó: `POST /api/properties` manda los mails de captación a coordinador,
 * admins y dueños, y geocodifica. Un asesor que genera, no le gusta el texto y
 * abandona dejaría una propiedad basura y mails que no se pueden desenviar.
 *
 * Es una interfaz ESTRUCTURAL a propósito: una fila completa de `properties`
 * sigue siendo asignable (los llamadores de siempre compilan sin tocarlos) y un
 * objeto armado desde el formulario del alta también entra.
 */
export interface DatosParaDescripcion {
  property_type: string
  address: string
  neighborhood: string
  city?: string | null
  operation_type?: string | null
  asking_price: number
  currency: string
  postal_code?: string | null
  latitude?: number | null
  longitude?: number | null
  expensas?: number | null
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  garages?: number | null
  covered_area?: number | null
  total_area?: number | null
  floor?: number | null
  age?: number | null
  /** `Json` en la fila de la base; el generador solo pregunta si es un array. */
  amenities?: unknown
  video_url?: string | null
  tour_3d_url?: string | null
  /** Lo que escribió el ASESOR, nunca lo que escribió el modelo (ver `datosParaDescripcion`). */
  description?: string | null
  location_insights?: LocationInsights | null
}

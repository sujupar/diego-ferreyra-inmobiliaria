/**
 * Constructores de filas de la encuesta para las pruebas. Por defecto: una encuesta creada al marcar
 * la visita realizada, sin enviar y sin responder, de Doblas 248 (USD 150.000, con cochera).
 */
import { RESPUESTAS_VACIAS, type EncuestaFila, type EncuestaConVisita, type VisitaDeEncuesta } from '@/lib/visitas/encuesta/tipos'

export const TOKEN_DE_PRUEBA = 'Ab3xK9pQ2rTz8LmN4vWq1Y'
export const VISITA_DE_PRUEBA = '44444444-4444-4444-8444-444444444444'
export const ENCUESTA_DE_PRUEBA = '55555555-5555-4555-8555-555555555555'
export const PROPIEDAD_DE_PRUEBA = '33333333-3333-4333-8333-333333333333'

export function encuestaDePrueba(cambios: Partial<EncuestaFila> = {}): EncuestaFila {
  return {
    ...RESPUESTAS_VACIAS,
    id: ENCUESTA_DE_PRUEBA,
    visit_id: VISITA_DE_PRUEBA,
    token: TOKEN_DE_PRUEBA,
    expires_at: '2026-11-14T15:00:00.000Z',
    created_at: '2026-10-15T15:00:00.000Z',
    updated_at: '2026-10-15T15:00:00.000000+00:00',
    send_status: 'sin_enviar',
    send_skip_reason: null,
    send_error: null,
    sent_at: null,
    sent_to: null,
    wa_message_id: null,
    opened_at: null,
    open_count: 0,
    last_step: null,
    completed_at: null,
    contact_phone: null,
    contact_email: null,
    wants_similar: null,
    team_notice_status: 'pendiente',
    gift_whatsapp_status: 'pendiente',
    gift_email_status: 'pendiente',
    gift_wa_message_id: null,
    notice_attempts: 0,
    notice_error: null,
    gift_downloaded_at: null,
    ...cambios,
  }
}

export function encuestaConVisitaDePrueba(
  encuesta: Partial<EncuestaFila> = {},
  visita: Partial<VisitaDeEncuesta> = {},
): EncuestaConVisita {
  return {
    encuesta: encuestaDePrueba(encuesta),
    visita: {
      id: VISITA_DE_PRUEBA,
      property_id: PROPIEDAD_DE_PRUEBA,
      client_name: 'Mariana Gómez',
      client_phone: '+5491158234521',
      scheduled_at: '2026-10-14T13:30:00.000Z',
      status: 'completed',
      advisor_id: '22222222-2222-4222-8222-222222222222',
      lead_id: '66666666-6666-4666-8666-666666666666',
      propiedad: {
        id: PROPIEDAD_DE_PRUEBA,
        address: 'Doblas 248',
        neighborhood: 'Caballito',
        photos: ['https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/property-files/properties/x/photos/1.jpg'],
        asking_price: 150000,
        currency: 'USD',
        property_type: 'departamento',
        amenities: [],
        garages: 1,
        floor: 3,
        expensas: 85000,
      },
      ...visita,
    },
  }
}

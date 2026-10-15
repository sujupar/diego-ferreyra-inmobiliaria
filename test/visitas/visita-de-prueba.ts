/**
 * Constructor de filas `VisitaListado` para las pruebas de la sección Visitas.
 * Valores por defecto = una visita confirmada, por cartel, de Doblas 248, con su
 * registro de comprador creado UN segundo antes (como lo crea POST /api/visits).
 * Cada llamada genera un id distinto (UUID válido RFC: zod 4 rechaza los inventados).
 */
import type { VisitaListado } from '@/lib/visitas/tipos'

let contador = 0

export const PROP_DOBLAS = '33333333-3333-4333-8333-333333333333'
export const ASESOR_LUCAS = '22222222-2222-4222-8222-222222222222'

export function visitaDePrueba(cambios: Partial<VisitaListado> = {}): VisitaListado {
  contador += 1
  return {
    id: `00000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    property_id: PROP_DOBLAS,
    direccion: 'Doblas 248',
    barrio: 'Caballito',
    advisor_id: ASESOR_LUCAS,
    asesor_nombre: 'Lucas Pérez',
    created_by: ASESOR_LUCAS,
    client_name: 'Sofía Benítez',
    client_phone: '+5491158234521',
    status: 'scheduled',
    origin: 'cartel',
    origin_detail: null,
    outcome_reason: null,
    scheduled_at: '2026-10-14T13:30:00.000Z',
    created_at: '2026-10-10T15:00:00.000Z',
    updated_at: '2026-10-10T15:00:00.000000+00:00',
    confirmed_at: '2026-10-10T15:00:00.000Z',
    outcome_at: null,
    consulta_recibida_at: null,
    registro_creado_at: '2026-10-10T14:59:59.000Z',
    ...cambios,
  }
}

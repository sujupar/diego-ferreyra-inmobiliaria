// Datos fijos para las pruebas de componentes de la cartera y para la sonda de render
// (`scripts/cartera.probe.tsx`). Nombres de la maqueta aprobada; nada de esto toca la base.
import type { FilaCartera, ProximoPaso } from '@/lib/crm/cartera'
import type { FilaContacto } from '@/lib/crm/contactos-cartera'
import type { EtapaCRM } from '@/lib/crm/etapas'
import type { DatosCartera, DatosContactos } from '@/lib/supabase/cartera'

/** Miércoles 2 de diciembre de 2026, 10:40 en Argentina. */
export const AHORA_PRUEBA = new Date('2026-12-02T13:40:00Z')
export const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`).toISOString()

export const PAULA = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Paula Pandolfo' }
export const TOMAS = { id: '22222222-2222-4222-8222-222222222222', nombre: 'Tomás Agüero' }
export const FLORENCIA = { id: '33333333-3333-4333-8333-333333333333', nombre: 'Florencia Ledesma' }

let n = 0
export function filaPrueba(p: Partial<FilaCartera> = {}): FilaCartera {
  n += 1
  const etapa: EtapaCRM = p.etapa ?? 'solicitud'
  return {
    id: p.id ?? `deal-${n}`,
    contactoId: p.contactoId === undefined ? `contacto-${n}` : p.contactoId,
    nombre: `Persona ${n}`,
    telefono: '11 5555-0148',
    email: null,
    propiedad: 'Depto 3 amb · Palermo',
    direccion: `Thames ${600 + n}`,
    etapa,
    abierto: !['captada', 'descartado'].includes(etapa),
    origen: 'embudo',
    asesor: null,
    creadoEn: ar('2026-12-01', '10:00'),
    cerradoEn: null,
    colega: false,
    anteriorAlRegistro: false,
    ultimoContacto: { at: ar('2026-12-01', '12:00'), que: 'llamada', resultado: 'no_atendio' },
    proximo: null,
    tasacion: null,
    ...p,
  }
}

export function pasoPrueba(
  fecha: string | null,
  hora: string | null,
  extra: Partial<ProximoPaso> = {},
): ProximoPaso {
  return {
    clase: 'tarea',
    titulo: 'Llamada 2',
    vence: { due_date: fecha, due_time: hora, all_day: false },
    quien: null,
    espera: null,
    instante: fecha ? ar(fecha, hora ?? '23:59') : null,
    ...extra,
  }
}

export function datosPrueba(p: Partial<DatosCartera> & { filas: FilaCartera[] }): DatosCartera {
  return {
    vista: { tipo: 'dueno', persona: null, mirando: false },
    asesores: [
      { id: TOMAS.id, nombre: TOMAS.nombre, activo: true },
      { id: FLORENCIA.id, nombre: FLORENCIA.nombre, activo: true },
    ],
    opcionesVerComo: [
      { id: PAULA.id, etiqueta: `${PAULA.nombre} · coordinación` },
      { id: FLORENCIA.id, etiqueta: `${FLORENCIA.nombre} · asesor` },
      { id: TOMAS.id, etiqueta: `${TOMAS.nombre} · asesor` },
    ],
    fuentes: { ultimoContacto: 'ok', tareas: 'ok' },
    truncado: false,
    generadoEn: AHORA_PRUEBA.toISOString(),
    ...p,
  }
}

export function contactoPrueba(p: Partial<FilaContacto> = {}): FilaContacto {
  n += 1
  return {
    id: `contacto-${n}`,
    contactoId: `contacto-${n}`,
    nombre: `Persona ${n}`,
    telefono: '11 5555-0148',
    email: null,
    propiedad: 'Depto 3 amb · Palermo',
    direccion: `Thames ${600 + n}`,
    origen: 'referido',
    asesor: null,
    creadoEn: ar('2026-12-01', '10:00'),
    registradoEn: ar('2026-12-01', '10:00'),
    cerradoEn: null,
    colega: false,
    anteriorAlRegistro: false,
    ultimoContacto: null,
    proximo: null,
    tasacion: null,
    proceso: { id: `deal-${n}`, etapa: 'solicitud' },
    conProcesoAbierto: true,
    ...p,
  }
}

export function datosContactosPrueba(p: Partial<DatosContactos> & { filas: FilaContacto[] }): DatosContactos {
  return {
    asesores: [{ id: TOMAS.id, nombre: TOMAS.nombre, activo: true }],
    fuentes: { ultimoContacto: 'ok', tareas: 'ok' },
    truncado: false,
    generadoEn: AHORA_PRUEBA.toISOString(),
    ...p,
  }
}

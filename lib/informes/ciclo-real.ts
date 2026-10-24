import 'server-only'
/** Las dependencias REALES del ciclo: base, fuentes, tareas de Pendientes y email por Resend. */
import { createTaskForRole } from '@/lib/supabase/tasks'
import { notificarInformesQuincenales } from '@/lib/email/notifications/informes-quincenales'
import * as datos from './datos'
import { fuentesPendientes, refrescarFuente } from './servicio'
import type { DependenciasCiclo } from './ciclo-servicio'

export function dependenciasReales(ahora: Date): DependenciasCiclo {
  return {
    propiedades: datos.propiedadesParaElCiclo,
    informesDelPeriodo: datos.informesDelPeriodo,
    crear: async (propertyId, desde, hasta) => {
      await datos.crearInforme({ propertyId, desde, hasta, origen: 'ciclo', creadoPor: null, fuentes: fuentesPendientes() })
    },
    refrescar: async (informeId, fuente) => {
      const i = await datos.leerInforme(informeId)
      if (!i) throw new Error('el informe ya no existe')
      if (i.estado !== 'borrador') return
      await refrescarFuente(i, fuente, ahora)
    },
    reclamar: ids => datos.reclamarAviso(ids, ahora),
    liberar: datos.liberarAviso,
    crearTarea: async ({ propertyId, direccion }) => {
      // Una tarea por propiedad y coordinador; si la del informe anterior sigue abierta, el índice único
      // (y `pendingTaskExists`) no la duplica: esa misma tarea lleva a la pestaña con los dos pendientes.
      await createTaskForRole('coordinador', {
        type: 'informe_quincenal',
        title: `Informe quincenal de ${direccion} listo para completar`,
        description: 'Cargar los números de Zonaprop y Argenprop, revisar los textos y las competidoras, y marcarlo como listo.',
        property_id: propertyId,
      })
      // `createTaskForRole` NUNCA lanza (registra y sigue): sin esta verificación, una tarea que no se creó (base
      // caída, ningún coordinador activo) contaría como avisada y Paula no se enteraría nunca.
      if (!(await datos.hayTareaDelInforme(propertyId))) throw new Error('la tarea no quedó creada (¿no hay coordinadores activos?)')
    },
    avisar: async (periodo, informes) => {
      const r = await notificarInformesQuincenales({ periodo, informes })
      if (!r) return { ok: false, detalle: 'no hay coordinadores activos con email' }
      return { ok: r.ok && r.failed === 0, detalle: `enviados ${r.sent}, fallidos ${r.failed}${r.errors.length ? `: ${r.errors.join('; ').slice(0, 300)}` : ''}` }
    },
    reloj: () => Date.now(),
  }
}

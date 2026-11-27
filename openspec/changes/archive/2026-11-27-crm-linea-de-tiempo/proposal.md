# Proposal

## Why

Para llamar bien a un lead hay que saber qué hizo: cuándo se registró, con qué anuncio, si
vio el video, qué WhatsApp recibió y qué contestó, por qué etapas pasó. Hoy esos datos
existen repartidos en varias tablas y ninguna pantalla los junta por persona: la ficha solo
muestra las notas, las llamadas y el WhatsApp marcado a mano.

## What Changes

- La "Línea de tiempo" de la ficha suma, a las notas y llamadas, los eventos que la
  plataforma ya registra, leídos de sus tablas en el momento (sin copiarlos):
  - registro en la landing, con el anuncio de Meta que la trajo;
  - cambios de etapa (incluidas la tasación coordinada y la entregada);
  - tareas creadas y completadas;
  - WhatsApp enviados y recibidos con el número de la persona;
  - video de la landing visto, con el porcentaje.
- Filtros: los cuatro de siempre. "Actividad" pasa a incluir los eventos del sistema.
- Desde ahora se guarda **quién** cambia una etapa, crea una tarea o la completa. Lo
  anterior queda sin nombre.

**Decisiones del dueño (2026-11-27, "ok a las 5"):**

1. Emails: fuera de este change. Hoy la plataforma no le escribe ningún email al lead.
2. Autor: lo viejo sin nombre; se empieza a guardar desde el deploy.
3. Anuncio: se muestra el nombre interno ("Anuncio de Meta · AD04 - VID08").
4. Consultas de portal: fuera (casi ninguna se vincula a un contacto).
5. WhatsApp: solo el número de la persona; nunca los números del equipo, las plantillas de
   aviso interno ni un número que comparten dos contactos.

**Queda afuera:** emails y sus avisos de entregado / abierto (se hace cuando la plataforma
les escriba a los leads), consultas de portal, guardar copias de los eventos, eventos que
no se miden (nunca se muestra un "abrió" o un "leyó" supuesto), navegación anónima no
vinculada al contacto.

Roles: los mismos que ven la ficha.

## Capabilities

### New Capabilities
- `crm-linea-de-tiempo`: qué eventos de un contacto se muestran, de dónde salen, cómo se
  escriben y en qué orden.

### Modified Capabilities
- `crm-ficha-contacto`: la zona de actividad pasa de notas y llamadas a la línea de tiempo
  completa, y el filtro "Actividad" incluye los eventos del sistema.

## Impact

- Base: columna `tasks.completed_by`; el autor de los cambios de etapa llega al historial
  con el mismo patrón que `property_visits.changed_by`; índices de lectura por contacto.
- Código: `lib/crm/linea-de-tiempo.ts` (puro), `lib/supabase/linea-de-tiempo.ts` (lecturas),
  `GET /api/contacts/[id]/activities` (devuelve la línea unida), componentes de la ficha.
- Externo: nada.
- Depende de `crm-ficha-y-llamadas` y `crm-cartera-por-rol` (en producción).

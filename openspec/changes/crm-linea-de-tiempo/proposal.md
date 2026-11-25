# Proposal

## Why

Para llamar bien a un lead hay que saber qué hizo: cuándo se registró, si vio el video, si
le llegó el WhatsApp, si abrió un correo. Hoy esos datos existen repartidos en varias
tablas y ninguna pantalla los junta por persona.

## What Changes

- La actividad de la ficha pasa a ser una línea de tiempo completa, ordenada por fecha, que
  suma a las notas y llamadas: registro en la landing (con campaña y anuncio), cambios de
  etapa, tareas creadas y completadas, WhatsApp enviados y recibidos, video visto,
  consultas de portal, tasación agendada y enviada.
- Filtros: Todo, Llamadas, Notas, Actividad.
- Emails al contacto: inventario de qué correos recibe hoy un lead y conexión de los
  avisos de entregado / abierto / clic. Si un aviso no se puede conectar, se publica sin
  ese evento y se documenta qué falta.
- **Queda afuera:** guardar copias de los eventos existentes, eventos que no se miden
  (nunca se muestra un "abrió" supuesto), actividad de navegación anónima no vinculada al contacto.

Roles: los mismos que ven la ficha.

## Capabilities

### New Capabilities
- `crm-linea-de-tiempo`: qué eventos de un contacto se muestran, de dónde salen y en qué orden.
- `crm-eventos-email`: registro de entrega, apertura y clic de los correos enviados a contactos.

### Modified Capabilities
- `crm-ficha-contacto`: la zona de actividad pasa de notas y llamadas a la línea de tiempo completa.

## Impact

- Base: tabla nueva `email_events`; índices de lectura por contacto y teléfono.
- Código: `app/api/contacts/[id]/timeline`, `lib/crm/timeline.ts`, webhook de Resend en
  `app/api/webhooks/` (ruta pública con firma verificada).
- Externo: alta del webhook en Resend (y Mailchimp si aplica).
- Depende de `crm-ficha-y-llamadas`.

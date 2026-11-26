# Proposal

## Why

El Inicio muestra cuatro números sueltos y no le dice a nadie qué tiene que hacer. Es la
primera pantalla que ve cada usuario y debería ser su lista de trabajo del día.

## What Changes

- **BREAKING (visual):** el Inicio actual de cuatro tarjetas se reemplaza por bloques según el rol.
- Coordinación: "Para llamar ahora" (leads con llamada vencida o sin primer contacto, del
  más antiguo al más nuevo, con llamar y registrar), "Sin respuesta tras WhatsApp", tareas
  de hoy, tasaciones agendadas de hoy y mañana, y tres números del día (solicitudes nuevas,
  llamadas hechas, agendadas).
- Asesor: sus tareas vencidas y de hoy, sus visitas y tasaciones de hoy, sus procesos que
  esperan algo de él.
- Admin y dueño: lo de coordinación en modo lectura, leads sin primer contacto con su
  antigüedad y el tiempo medio a la primera llamada de la semana, con su cantidad de casos.
- Se conservan el aviso de conversaciones sin identificar y el acceso a conectar avisos.
- **Queda afuera:** análisis del negocio (sigue en Métricas), personalización de bloques,
  el Inicio del abogado (sigue yendo a revisión legal).

Roles: coordinador, asesor, admin, dueño.

## Capabilities

### New Capabilities
- `inicio`: qué ve cada rol al entrar y qué puede resolver desde ahí.

### Modified Capabilities

Ninguna.

## Impact

- Código: `app/(dashboard)/inicio/page.tsx` (reemplazo), `components/inicio/`, una ruta de
  lectura para la cola de llamadas, `lib/crm/cola-llamadas.ts`.
- Depende de `crm-ficha-y-llamadas` (cola y registro) y `crm-tareas-y-campanita` (tareas por vencimiento).
- Pendiente que deja `crm-ficha-y-llamadas`: cuando exista el bloque "Sin respuesta tras
  WhatsApp", volver a poner en los avisos de la ficha los textos de la maqueta que lo nombran
  ("…queda en «Sin respuesta» del Inicio…"); hasta entonces la ficha usa textos que no lo
  mencionan. Este change también tiene que juntar las solicitudes que quedaron sin ninguna
  tarea pendiente (secuencia terminada, o tarea que no se pudo crear).
- Pendiente que deja `crm-ficha-y-llamadas`: la ficha necesita una entrada que la abra con
  "Registrar llamada" ya abierto —la pide la spec vigente de `crm-sistema-diseno` para el botón
  "Registrar" del Inicio—, leída en el servidor igual que `abrirEditor` (D5 de la ficha) y, en
  celular, con el foco en "No atendió". La ficha no la construyó.
- Pendiente que deja `crm-ficha-y-llamadas`: "Mis contactos" del asesor no lista los contactos
  que ve solo por un proceso o una tasación a su nombre (sí puede abrir su ficha).

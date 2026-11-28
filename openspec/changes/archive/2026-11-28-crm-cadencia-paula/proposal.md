# Proposal

## Why

El dueño contó el 2026-11-28 cómo trabaja de verdad la coordinación (Paula):

1. Hace la primera llamada lo antes posible, dentro de su horario: **de 10 a 14** (Argentina).
2. Si no atiende, vuelve a llamar esa tarde o al otro día.
3. Si no atiende la segunda, al día siguiente hace la tercera.
4. Si no atiende la tercera, le escribe por WhatsApp; con algunos se coordina por ahí.

Habla con más o menos el 50 % de la gente. La plataforma hoy pide el WhatsApp después de
**dos** llamadas y agenda a las 9:00 con un horario de 9 a 18: no es su proceso.

## What Changes

- **Tres llamadas antes del WhatsApp** (antes, dos).
- **Llamada 2:** el mismo día a las 13:30 si la Llamada 1 se registró un día hábil antes de las
  12:00; si no, el día hábil siguiente a las 10:00 (recomendación aprobada por el dueño).
- **Llamada 3:** el día hábil siguiente a las 10:00.
- **WhatsApp:** después de la tercera no atendida, vence en el momento si es horario de la
  coordinación ("se manda ya"); si no, a las 10:00 del día hábil que corresponda.
- **Horario de la coordinación 10 a 14** en todo lo que hoy usa el horario laboral: la tarea
  de entrada de un lead, la hora del día hábil siguiente y las "horas hábiles" de las esperas
  (Inicio, CRM y Métricas).
- **Queda afuera:** feriados, "Posponer · Mañana a las 9:00" (es una elección de la persona),
  rehacer las tareas que ya existen.

## Impact

- Código: `lib/crm/horario-laboral.ts`, `lib/crm/cadencia.ts` y sus tests; textos que nombran la
  hora. Sin migración.
- Specs: `crm-cadencia-llamadas`, `tareas`, `inicio`, `metricas-llamadas`.
- Las tareas ya creadas no se tocan; un proceso que ya tenía su "Enviar WhatsApp" tras dos
  llamadas sigue con esa tarea.

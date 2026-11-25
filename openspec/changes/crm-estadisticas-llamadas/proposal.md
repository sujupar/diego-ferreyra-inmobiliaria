# Proposal

## Why

Registrar las llamadas sirve si después se puede leer: cuánto tardamos en llamar, cuántos
atienden y en qué intento se agenda. Con eso se decide cada cuánto volver a llamar y si
hace falta más horario de coordinación.

## What Changes

- Sección nueva en Métricas, debajo del estado de resultados del embudo, por cohorte de
  solicitudes del embudo creadas en el período:
  - tiempo de registro a primera llamada (mediana y promedio), en horas de reloj y en horas hábiles;
  - tiempo de primera a segunda llamada;
  - intentos hasta el primer "atendió";
  - % contactados, % agendados y en qué intento se agendó;
  - reparto de resultados de llamada;
  - solicitudes sin ningún intento registrado.
- Cada número con su cantidad de casos y aviso cuando son menos de 20.
- La medición arranca el día de salida de `crm-ficha-y-llamadas`; lo anterior no cuenta.
- **Queda afuera:** comparación entre personas, metas, alertas automáticas, duración de las llamadas.

Roles: quienes ya ven Métricas (admin, dueño, coordinador).

## Capabilities

### New Capabilities
- `metricas-llamadas`: definición de cada métrica de contacto de leads y cómo se muestra.

### Modified Capabilities

Ninguna.

## Impact

- Base: función de lectura (RPC) sobre `contact_activities`, `deals` y `deal_stage_history`.
- Código: `lib/crm/metricas-llamadas.ts`, `lib/crm/horario-laboral.ts`, componente en `/metrics`.
- Depende de `crm-ficha-y-llamadas` en producción con datos reales de al menos dos semanas
  para que los números signifiquen algo.

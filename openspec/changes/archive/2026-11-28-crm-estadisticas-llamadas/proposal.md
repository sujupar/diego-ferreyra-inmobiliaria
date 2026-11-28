# Proposal

## Why

Registrar las llamadas sirve si después se puede leer: cuánto tardamos en llamar, cuántos
atienden y en qué intento se agenda. Con eso se decide cada cuánto volver a llamar y si
hace falta más horario de coordinación.

## What Changes

- Sección nueva en el Tablero de Métricas ("2 · Llamadas a las solicitudes"), debajo de la
  campaña de tasación, por cohorte de las MISMAS solicitudes de tasación que cuenta el Tablero
  (personas únicas, sin pruebas, colegas ni pedidos repetidos) creadas en el período:
  - tiempo de registro a primera llamada (mediana y promedio), en horas de reloj y en horas hábiles;
  - tiempo de primera a segunda llamada;
  - intentos hasta el primer "atendió";
  - % contactados, % agendados y en qué intento se agendó;
  - reparto de resultados de llamada;
  - solicitudes sin ningún intento registrado.
- Cada número con su cantidad de casos y aviso cuando son menos de 20.
- La medición arranca el día de salida de `crm-ficha-y-llamadas`; lo anterior no cuenta. **Inicio de la cohorte: 2026-11-26 a las 21:04 (hora de Argentina)** — primera respuesta del código nuevo en `https://inmodf.com.ar` (00:04:52 UTC del 27/11; a las 00:03:08 UTC todavía servía el anterior), main en `0a0096fe`.
- **Queda afuera:** comparación entre personas, metas, alertas automáticas, duración de las llamadas.

Roles: quienes ya ven Métricas, es decir admin y dueño (`metrics.view`). La coordinación NO ve
Métricas hoy (el Tablero tiene la plata del negocio); la propuesta original decía lo contrario y
estaba mal. Darle a la coordinación sus números de llamadas queda como pregunta al dueño.

## Capabilities

### New Capabilities
- `metricas-llamadas`: definición de cada métrica de contacto de leads y cómo se muestra.

### Modified Capabilities

Ninguna.

## Impact

- Base: sin migración. Una lectura más de `contact_activities` dentro del armado del Tablero,
  que ya trae las solicitudes con sus exclusiones (`armarPersonas`); no hace falta RPC.
- Código: `lib/crm/metricas-llamadas.ts` (reglas puras), `lib/metrics/tablero/servidor.ts`,
  `components/metrics/tablero/SeccionLlamadas.tsx`; las secciones 2 a 4 pasan a 3 a 5.
- Datos: al 28/11/2026 hay **cero** llamadas registradas en producción y una sola solicitud
  desde el inicio de la medición. La sección sale vacía ("Todavía no hay llamadas
  registradas") y se llena a medida que la coordinación registra; con menos de 20 casos
  cada número avisa "Pocos casos".

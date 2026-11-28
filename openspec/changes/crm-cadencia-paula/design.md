# Design

## Context

`lib/crm/horario-laboral.ts` define `HORARIO_LABORAL` (9:00 a 18:00) y `siguienteDiaHabil`
(día hábil siguiente a la hora de inicio). Lo usan la cadencia (`lib/crm/cadencia.ts`,
`siguienteDeNoAtendio`), la tarea de entrada y el vencimiento de tareas sin hora
(`lib/tareas/agenda.ts`), y `minutosHabilesEntre` (Inicio, CRM, Métricas). La cadencia cuenta
la racha de "No atendió" seguidas (`estadoCadencia`) y con 2 o más crea "Enviar WhatsApp".

## Decisions

### D1. Un solo horario: el de la coordinación
`HORARIO_LABORAL = { dias: lunes a viernes, inicio: '10:00', fin: '14:00' }`. Todo lo que hoy
lo lee pasa a 10–14 sin tocar cada lugar. Las "horas hábiles" pasan a medir el horario en que
alguien puede llamar, que es lo que importa de una espera. **Excepción (auditoría 2):** las
tareas "todo el día" avisan desde las 9:00 (spec `tareas-avisos`, textos de "Nueva tarea"):
`momentoDeAviso` pasa a leer una constante propia `HORA_AVISO_TODO_EL_DIA = '09:00'` y no
cambia. Posponer "Mañana a las 9:00" tampoco cambia.

### D2. Cuándo va cada tarea (`lib/crm/cadencia.ts`, puro)
- Por racha, no por número (auditoría 6): `racha.noAtendioSeguidas` (incluye la que se
  registra) 1 → llamada siguiente: si `cargadoEn` es día hábil y su hora de Argentina es
  < 12:00 → ese día 13:30; si no → `siguienteDiaHabil`. El título sigue siendo
  "Llamada {numeroDeIntento+1}".
- 2 → llamada siguiente en `siguienteDiaHabil` (también si se cargó de madrugada: escenario).
- ≥ 3 → "Enviar WhatsApp" en `enHorarioOProximo(cargadoEn)`: la función que hoy es
  `vencimientoDeEntrada` en `lib/tareas/agenda.ts` se mueve a `horario-laboral.ts` y la usan
  los dos (auditoría 8): día hábil de 10:00 a 13:59 → ese día y la hora (HH:MM); antes de las
  10:00 → ese día a las 10:00; si no → `siguienteDiaHabil`.
- Siempre `cargadoEn` (auditoría 7, decidido y escrito en la spec).
- Las excepciones («Qué regla gana…») no cambian. Se usa `cargadoEn` como siempre: un
  reintento agenda igual que el guardado original.
- Constantes con nombre: `CORTE_MISMA_TARDE = '12:00'`, `HORA_MISMA_TARDE = '13:30'`,
  `LLAMADAS_ANTES_DEL_WHATSAPP = 3`.

### D3. El aviso
El aviso ya arma "para hoy/mañana/{día}, HH:MM" desde la tarea; con la Llamada 2 de la misma
tarde tiene que decir "para hoy 13:30". Si la tarea ya venció al armar el aviso (el WhatsApp
"ya", o un reintento tardío), dice "para ahora" (auditoría 1), no "para recién" ni "hace 1
min". Lo mismo en "Tarea creada sola" de la línea de tiempo.

## Risks / Trade-offs

- Un lead que entra a las 15:00 ya no "espera" desde las 15:00: su tarea vence al día
  siguiente a las 10:00 y las horas hábiles de espera cuentan desde ahí. Es lo que pasa en la
  realidad (Paula no está a esa hora).
- Las estadísticas de horas hábiles cambian de escala (4 h por día en vez de 9). Hoy no hay
  llamadas registradas, así que no hay números viejos que comparar.
- Un asesor que registra una llamada en su proceso también recibe las tareas a las 10:00 y la
  Llamada 2 a las 13:30: es la misma cadencia para todos.

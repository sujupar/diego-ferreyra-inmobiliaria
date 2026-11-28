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
alguien puede llamar, que es lo que importa de una espera.

### D2. Cuándo va cada tarea (`lib/crm/cadencia.ts`, puro)
- `racha.noAtendioSeguidas` (incluye la que se registra) 1 → "Llamada 2": si `cargadoEn` es día
  hábil y su hora de Argentina es < 12:00 → ese día 13:30; si no → `siguienteDiaHabil`.
- 2 → "Llamada 3" en `siguienteDiaHabil`.
- ≥ 3 → "Enviar WhatsApp" en `ahoraOProximoHabil(cargadoEn)`: día hábil y hora en [10:00,
  14:00) → ese día y la hora (HH:MM) del registro; día hábil antes de las 10:00 → ese día a
  las 10:00; si no → `siguienteDiaHabil`.
- Las excepciones («Qué regla gana…») no cambian. Se usa `cargadoEn` como siempre: un
  reintento agenda igual que el guardado original.
- Constantes con nombre: `CORTE_MISMA_TARDE = '12:00'`, `HORA_MISMA_TARDE = '13:30'`,
  `LLAMADAS_ANTES_DEL_WHATSAPP = 3`.

### D3. El aviso
El aviso ya arma "para hoy/mañana/{día}, HH:MM" desde la tarea; con la Llamada 2 de la misma
tarde tiene que decir "para hoy 13:30". Verificar con test del texto.

## Risks / Trade-offs

- Un lead que entra a las 15:00 ya no "espera" desde las 15:00: su tarea vence al día
  siguiente a las 10:00 y las horas hábiles de espera cuentan desde ahí. Es lo que pasa en la
  realidad (Paula no está a esa hora).
- Las estadísticas de horas hábiles cambian de escala (4 h por día en vez de 9). Hoy no hay
  llamadas registradas, así que no hay números viejos que comparar.
- Un asesor que registra una llamada en su proceso también recibe las tareas a las 10:00 y la
  Llamada 2 a las 13:30: es la misma cadencia para todos.

# Auditoría — crm-ficha-y-llamadas

Registro de la auditoría doble. Esta primera parte es la de los **artefactos** (propuesta,
specs, diseño técnico y tareas), antes de escribir código. La auditoría del código y del QA
se suma acá cuando se construya (grupo 14 de `tasks.md`).

## 1. Auditoría de los artefactos (2026-11-25)

Cómo se hizo: cinco lectores mapearon el código actual (ficha de hoy, tareas, procesos,
permisos, maqueta aprobada). Con eso se escribieron las tres specs, `design.md` y
`tasks.md`. Cada ronda tuvo un primer equipo de tres auditores nuevos (cobertura de lo
pedido, técnica y base de datos, producto y anti-metas) y un segundo auditor que revisó los
artefactos y el trabajo del primer equipo. Todo hallazgo se comprobó contra el código o la
maqueta antes de corregirlo.

| Ronda | Hallazgos de peso, primer equipo | Hallazgos de peso, segundo auditor | Qué se hizo |
| --- | --- | --- | --- |
| 1 | 21 | 1 | Corregidos todos. Los más importantes: permisos de contactos abiertos a cualquier usuario con sesión, coordinar creaba un proceso duplicado, y la regla de qué tareas cierra una llamada |
| 2 | 4 | 1 | Corregidos todos. SQL de la migración y su script de verificación revisados aparte |
| 3 | 2 | 1 | Corregidos todos, más 12 menores. El de peso del segundo auditor: qué ve un asesor en "Detalles" cuando el último proceso, ya cerrado, es de otro asesor |

`npx -y @fission-ai/openspec@2.2.0 validate crm-ficha-y-llamadas --strict` pasa después de
cada ronda de correcciones.

Lo que los auditores verificaron en el código y está bien: permisos por rol de las cuatro
acciones de la ficha, el trigger de cambio de etapa, que marcar "perdido" no toca la fecha
ni las notas, los consumidores de las rutas de contactos, y la tabla completa de la
cadencia (más de 20 secuencias de llamadas, todas con una sola respuesta e igual en spec y
diseño).

### Estado

**Abierto.** Falta una cosa antes de construir (la 2):

1. **Respuestas del dueño: recibidas el 2026-11-25.** Contestó "Ok a todo": quedó
   confirmada la opción más prudente de cada pregunta que cambia lo que se construye
   (`design.md`, "Open Questions", grupo A). El grupo B sigue abierto y no frena.
2. **Verificación final.** Las correcciones de la ronda 3 las verificó quien las hizo
   (validación estricta incluida), no un auditor nuevo. Con las respuestas del dueño
   aplicadas, pasa una última ronda de dos auditores y recién ahí se cierra esta sección.

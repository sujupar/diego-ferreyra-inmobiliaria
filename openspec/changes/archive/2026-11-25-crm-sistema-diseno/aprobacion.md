# Aprobación de la maqueta — crm-sistema-diseno

## 2026-11-25 — Aprobada

- **Quién:** el dueño.
- **Qué dijo:** «Aprobada, pasá al change 2».
- **Qué pidió cambiar:** nada. Se aprobó tal como estaba publicada.
- **Qué quedó:** la maqueta de `maqueta/index.html` como sistema de diseño del módulo CRM, con sus capturas a 390, 1024 y 1280 px en `maqueta/capturas/`.

## Después de la aprobación

Se corrigieron los 11 detalles menores de texto y pulido que había dejado el segundo auditor (lista completa en `auditoria.md`, sección «Pulido después de la aprobación del dueño»). No cambian estructura, layout ni comportamiento. Las capturas se regeneraron con esos ajustes.

Tres de esos ajustes se ven a simple vista y conviene que el dueño los sepa:

1. En la ficha, el evento del email ahora dice «Se le envió el email …» en vez de «Recibió el email …», porque hoy se sabe que se envió, no que llegó.
2. La vista del dueño usa una persona ficticia, «Raúl Maidana», en lugar de una persona llamada «Dueño».
3. En tablets táctiles los botones y campos mantienen el tamaño del celular (44 px y letra de 16 px). En computadora no cambia nada.

## Después de la auditoría final (2026-11-25)

Tres auditores nuevos revisaron la maqueta aprobada: cero hallazgos de peso. Se corrigió pulido que no cambia lo aprobado (detalle en `auditoria.md`, sección 4) y la spec se puso al día con la maqueta. Lo único que se ve a simple vista:

1. En «Sistema de diseño», un título largo de la línea de tiempo pasa a un segundo renglón en vez de cortarse con «…», igual que en la ficha. Y «No atendió» figura primero entre los resultados, como en la ficha.
2. En la ficha en celular, al tocar «+» → «Nota» el cursor ya queda en el campo.
3. En el Inicio en celular hay 3 px más de aire debajo del nombre de cada persona.

Las capturas se regeneraron y ahora son 45: `campanita-390` y `campanita-1280` muestran el estado inicial (6 avisos) y las de después de registrar una llamada se llaman `flujo-campanita-tras-llamada-390` y `-1280`.

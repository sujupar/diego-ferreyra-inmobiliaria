# Tasador — arreglos de la auditoría y freno a la distancia con el Tasador IA

**Fecha:** 2026-10-03 · **Tamaño:** mediano · **Rama:** `fix/tasador-auditoria` (desde `origin/main` eb9fade)

## Problema y resultado

**Problema:** el tasador "se siente raro": los números cambian solos, el PDF se contradice, se
pierde trabajo del asesor y algunos datos se asumen sin avisar. Además, el Tasador IA no tiene
ningún freno que le impida alejarse mucho del clásico.

**Resultado:** una tasación solo cambia cuando alguien cambia un dato; lo que dice el PDF
coincide en todas sus partes; ningún dato vacío se convierte en un número escondido; y el
Tasador IA queda dentro de una banda razonable del clásico, o avisa y explica por qué no.

## Base de evidencia (auditoría del 2026-10-03, contra producción y la base real)

62 tasaciones reales. Cifras medidas: 6 cambiarían de precio con solo abrirlas (+7 % a +18 %);
18 de 53 informes tienen textos con un precio distinto al del recuadro; 9 tienen precios
cargados a mano que "Calcular" borraría; 23 de 62 propiedades tasadas y 68 de 254 comparables
tienen el piso vacío (tratado como planta baja). Tasador IA vs clásico: diferencia típica 1,2 %,
máxima 18 % (las 6 de abril), sin freno técnico.

## Qué cambia (criterios de aceptación)

Cada punto es verificable en la interfaz o en la base.

### Grupo A — que nada cambie solo (los tres primeros, aprobados por el dueño)

- **A1. Abrir no recalcula ni guarda.** Al abrir "Editar tasación" y no tocar nada, el precio
  es el guardado y en la base `updated_at` no cambia. Recién al cambiar un dato se recalcula y
  se autoguarda. Si las reglas actuales darían otro número, se muestra un aviso "Con las reglas
  actuales esta tasación daría USD X (antes USD Y)" con un botón "Actualizar" — nunca se aplica solo.
- **A2. "Calcular" no borra lo ajustado.** Volver a tocar "Calcular" conserva textos editados,
  precios cargados a mano, Zona de No Venta manual, semáforos y orden/ocultamiento de páginas.
  Solo se completan los campos que estaban vacíos.
- **A3. Los textos del PDF usan el precio vigente.** Las frases de análisis y estrategia muestran
  siempre el precio actual (el cargado a mano si existe). Si el asesor escribió el texto a mano,
  el precio dentro del texto se actualiza igual (el texto guarda un marcador, no el número). Las
  18 tasaciones desfasadas quedan corregidas sin tocar sus precios (migración de datos que
  reemplaza el número viejo por el marcador; se lista antes cada cambio para revisarlo).

### Grupo B — que ningún dato se pierda ni se invente

- **B1. Piso vacío.** *(decisión del dueño, ver Preguntas)* deja de tratarse como planta baja
  en silencio.
- **B2. Semicubierta.** La superficie semicubierta cargada en el asistente llega al cálculo y se
  puede editar en el sujeto y en cada comparable. La "superficie total" que se ve es la que se usa.
- **B3. La ficha no pisa ediciones.** En `/appraisals/[id]`, editar el comparable 1 y luego el 2
  conserva las dos ediciones; la "parte del propietario" y los escenarios de compra se recalculan
  y no desaparecen.
- **B4. Precio de compra vacío.** Una propiedad de compra sin precio no se puede marcar hasta
  cargarle precio (se abre un editor). Se elimina el USD 100.000 inventado.
- **B5. Precio cargado a mano coherente.** Si el asesor fija el precio de publicación a mano,
  venta, escritura, gastos, dinero en mano, escenarios, historial y `publication_price` salen de
  ese precio. La Zona de No Venta manual no puede quedar por debajo de la publicación.
- **B6. Moneda.** Un comparable en pesos no entra al promedio: se pide convertirlo o descartarlo.
- **B7. Borrador viejo.** Una "Nueva tasación" nunca arranca con datos de otra.
- **B8. "% del propietario"** recalcula en el momento.
- **B9. Superficies del portal.** Cuando la descubierta se dedujo (total − cubierta), el editor
  del comparable lo marca "deducida: revisar" para que el asesor la confirme.

### Grupo C — que lo que se ve sea lo que se aplica

- **C1.** Los estados de conservación muestran el coeficiente que realmente se aplica (ej.
  "Estado 3 — ×0,91"), no el % de la tabla.
- **C2.** El botón dice "Guardando…" al guardar y "Calculando…" solo al calcular; un error de
  cálculo no se muestra como error de guardado ni deja un informe viejo a la vista.
- **C3.** Tabla Ross-Heidecke: se corrigen los 5 valores mal tipeados (impacto ≤ 0,5 %), con un
  test que verifica la tabla entera contra su fórmula.
- **C4.** Fechas y formato: la vista previa usa la fecha de la tasación; números con formato
  argentino en todo el PDF; "0k" nunca aparece.
- **C5.** Fórmulas únicas: la superficie homologada y los gastos se calculan en un solo lugar.

### Grupo D — Tasador IA cerca del clásico

**Por qué se separan:** cuando falta un dato, el clásico asume un valor fijo y la IA lo decide;
el coeficiente de ubicación (0,70–1,30) por sí solo puede mover el precio más de 30 %, y los
coeficientes se multiplican. Así es posible 130.000 vs 240.000.

- **D1. Mismos supuestos de partida.** Los arreglos B1/B2 hacen que clásico e IA traten igual
  los datos vacíos.
- **D2. Ubicación acotada.** La IA solo puede mover la ubicación dentro de 0,85–1,15 y debe
  justificar cada valor distinto de 1,00.
- **D3. Banda de distancia.** *(umbral a confirmar)* Si el IA queda a más del X % del clásico,
  la pantalla lo muestra en rojo, con el desglose de qué coeficientes explican la diferencia, y no
  se puede elegir el IA como tasación en uso sin confirmar.
- **D4. Medición.** Se re-corre el IA sobre las 62 tasaciones (sin cambiar cuál está en uso) y se
  reporta la distribución de diferencias antes y después.

## Qué queda afuera

- Cambiar el método (fórmula, coeficientes oficiales, vida útil 70 años).
- Soportar terrenos y casas fuera de CABA con un método propio (hoy se fuerzan; se documenta).
- Recalcular precios ya entregados: ninguna tasación cambia de precio por este trabajo salvo que
  el asesor toque "Actualizar".

## Riesgos (pre-flight)

- 🟡 Migración de datos en `report_edits` (A3): se hace con script `pg` que primero lista y
  después aplica, sobre las 18 filas; sin `DROP` ni cambios de esquema.
- 🟡 Sesiones paralelas: la carpeta compartida está en una rama vieja; todo se hace en este
  worktree y se verifica el diff antes del merge.
- 🟢 IA: el re-cálculo D4 es una llamada por tasación, de a una (regla "una IA por request");
  usa el proveedor ya configurado. No hay costo nuevo verificable más allá de esas 62 llamadas.
- 🟢 Sin emails, WhatsApp ni campañas involucradas.

## Preguntas abiertas (para el dueño / Diego)

1. **Piso vacío (B1):** ¿lo hacemos obligatorio, o lo tratamos como neutro (×1,00)? Neutro
   cambia precios de tasaciones que se re-calculen.
2. **Umbral de distancia IA (D3):** propuesta 15 %.
3. **Gastos de escritura:** en la venta se calculan sobre el precio de venta y en la compra sobre
   el valor de escritura. ¿Es intencional?

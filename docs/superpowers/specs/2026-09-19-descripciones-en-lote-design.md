# Descripciones con el método de Diego: todas y cada una de las propiedades

- **Fecha:** 2026-09-19
- **Tamaño:** mediano (reglas de requisitos, estructura nueva en el prompt, un índice).
- **Rama:** `feat/descripciones-en-lote` (nombre histórico: el lote se descartó, ver abajo).
- **Base:** el generador por propiedad ya desplegado (PR #17). El dueño lo probó en Perón 4227: "la diferencia es absurda a favor de la última versión".

## Decisión del dueño (2026-09-19)

- **Nada de regeneración en lote ni automática.** Cada propiedad se regenera cuando alguien entra a su ficha y toca "Regenerar descripción", con **exactamente el mismo proceso** que se usó en Perón 4227 (fotos → zona → preguntas si faltan → escribir → vista previa → Guardar).
- **Las descripciones actuales NO son fuente.** Las generó el sistema viejo, mucho más pobre; no se usan para nada. El proceso nuevo ya no las lee (la descripción previa solo queda como respaldo al guardar), y queda un test que lo garantiza.

## Problema

1. **Los terrenos no pueden generar.** El requisito pide ambientes y superficie cubierta, que un terreno no tiene: el botón les queda deshabilitado (2 de 39 hoy).
2. **Escala:** la ficha busca la visita del proceso vinculado con `deals.property_id`, que no tiene índice (892 procesos hoy). Con miles, esa consulta se degrada.

## Resultado esperado

Toda propiedad activa con fotos y datos básicos —terrenos incluidos— puede generar o regenerar su descripción desde la ficha con el proceso completo, y la ficha responde igual de rápido con miles de propiedades y procesos.

## Qué cambia

### Terrenos

- **Requisitos para terreno:** fotos (5), dirección, barrio, **superficie del lote** (`total_area`) y precio. No se piden ambientes ni superficie cubierta.
- **Estructura TERRENO en el prompt.** Diego no la escribió: sale de su estructura de casa sin el recorrido de ambientes, con sus mismas reglas y rotulada como adaptación:
  1. **El lote:** superficie, medidas si están, y lo que se ve en las fotos (forma, arbolado, construcciones existentes, cerramientos).
  2. **Posibilidades de uso:** SOLO si están en los datos o en las notas del asesor, nunca supuestas (nada de "ideal para construir X metros").
  3. **Ubicación:** igual que en casa.
  4. **Emoción:** 40 palabras como máximo.
  5. **Invitación** y **disclaimer literal**.
- **Datos:** se presentan como "Superficie del lote", no como "Superficie total".

### Escala

- **Índice** `deals (property_id) WHERE property_id IS NOT NULL`. Es aditivo y beneficia también a las demás pantallas que buscan el proceso de una propiedad.
- Las demás consultas de la ficha ya están indexadas: `property_landings.property_id` (único), `property_listings.property_id`, `properties.id`.
- Cada generación es independiente por propiedad y su caché vive en la fila de la propiedad: no hay nada global que crezca con la cantidad de propiedades.

## Qué queda afuera

- Regeneración en lote o automática (decisión del dueño).
- Usar la descripción actual como fuente (decisión del dueño).

## Criterios de aceptación

1. Un terreno con fotos, dirección, barrio, superficie del lote y precio tiene el botón habilitado y genera con la estructura de terreno: sin recorrido de ambientes y sin posibilidades de uso inventadas.
2. Un terreno sin superficie del lote muestra "Falta: superficie del lote".
3. Departamentos, casas y PH siguen exactamente igual (sus requisitos y su estructura no cambian).
4. La descripción actual de la propiedad nunca llega al prompt (test).
5. El índice existe en producción y la consulta de la visita lo usa.
6. **Prueba real:** los 2 terrenos generan de punta a punta sin guardar, y los textos se auditan.

## Riesgos

- 🟡 La estructura de terreno no es de Diego: se muestra en la vista previa y el dueño la aprueba o corrige.
- 🟢 El índice es aditivo; en 892 filas se crea al instante.
- 🟢 `faltanParaGenerar` cambia solo para terrenos; sus consumidores (servicio y script) no cambian de firma.

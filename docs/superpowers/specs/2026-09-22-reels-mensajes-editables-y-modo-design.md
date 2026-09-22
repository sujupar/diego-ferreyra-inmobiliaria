# Reels: revisión obligatoria de los mensajes y un solo selector de modo

**Fecha:** 2026-09-22 · **Tamaño:** mediano (migración + lógica + pantallas) · Aprobado por el dueño en el chat.
**Antecedentes:** PR #24 (reels) y PR #25 (varias palabras, cuentas de prueba).

## Problema

1. Al tocar "Enganchar" el reel se guardaba sin mostrar qué se le iba a decir a la gente. Las
   **frases públicas** del comentario no se veían en ningún lado y no se podían cambiar.
2. Los dos interruptores ("Modo simulacro" + "Automatización") no se entienden: el dueño no supo
   cuándo usar cada uno. Y la etiqueta "Publicado" parecía decir "ya está activo", cuando solo
   significa que el reel existe en Instagram.

## Resultado esperado

Antes de guardar un reel, el asesor ve y puede editar TODO lo que el sistema va a decir, armado
como una conversación. Y el reel tiene un estado que se entiende de un vistazo.

## Qué ve el usuario

**Enganchar y Subir pasan a dos pasos:**
1. Elegir el reel o subir el video, y escribir las palabras → botón **"Siguiente"**.
2. **"Revisá los mensajes"**, obligatorio, armado como un chat de Instagram:
   - **En el comentario:** un comentario de ejemplo ("doblas") y debajo las **3 frases** que rotan,
     editables. Más abajo, **"Si el privado no sale"**, otras 3 frases editables, con la aclaración de
     que hoy se usan esas porque los privados están apagados.
   - **Por privado:** el mensaje de inicio y el texto del botón (hasta 20 caracteres).
   - **Cuando toca el botón:** la respuesta de la persona (el botón) y nuestro mensaje con el
     enlace de la landing (el enlace se ve, no se edita).
   - Botones **"Atrás"** y **"Enganchar"** (o **"Guardar"** al subir).

   El reel se guarda **Apagado**. Lo pasa a Modo prueba el asesor cuando quiere.

**Configurar** muestra el mismo bloque de mensajes y, en vez de los dos interruptores, **un solo
selector** con tres opciones:
- **Apagado** — no responde a nadie.
- **Modo prueba** — responde de verdad solo a las cuentas de prueba; al resto lo anota sin escribirle.
- **En vivo** — responde a todo el que comente alguna palabra. Elegirlo pide una confirmación.

Si el interruptor general está apagado, el selector lo avisa: "Aunque elijas Modo prueba o En vivo,
no va a responder hasta que se prenda la automatización general."

**La fila del reel** muestra el modo (Apagado / Modo prueba / En vivo) en vez de "Publicado". Para
los reels que todavía no están en Instagram sigue mostrando Borrador / Programado / Publicando / Falló.

## Qué pasa por detrás

- Columnas nuevas en `property_reels`: `respuestas_con_privado text[]` y `respuestas_sin_privado text[]`,
  NOT NULL, con 3 frases de fábrica como default (los reels existentes las reciben solos). CHECK: de 1
  a 3 frases, cada una de 1 a 300 caracteres.
- El modo NO es una columna nueva: se traduce a las dos que ya existen (`automatizacion_activa`,
  `simulacro`) con una función pura. Así el procesador, el cron y los frenos no cambian.
- La respuesta pública se elige de las frases DEL REEL. Si por algún motivo la lista llega vacía, se
  usa el catálogo de fábrica: un comentario nunca queda con una respuesta vacía.
- Los textos de fábrica (frases, privado, botón, mensaje del enlace) viven en UN módulo puro que usan
  el procesador y la pantalla: lo que se ve es exactamente lo que se manda.
- `GET /reels` devuelve además el estado de los interruptores generales (solo lectura).

## Qué queda afuera

- Un botón para prender el interruptor general desde la pantalla (sigue siendo por script).
- Frases distintas por palabra.
- Editar la descripción de un reel ya publicado (vive en Instagram).

## Criterios de aceptación

1. En "Enganchar", tocar "Siguiente" muestra la revisión con las 3 frases, las 3 de respaldo, el
   privado, el botón y el mensaje del enlace, todo precargado y editable. "Enganchar" guarda eso.
2. Sin tocar nada en la revisión, el reel queda con las frases y mensajes de fábrica y en **Apagado**.
3. En "Subir un reel" el mismo paso aparece antes de guardar.
4. Una frase vacía se descarta; sin ninguna frase no deja guardar. Más de 300 caracteres o un botón de
   más de 20 no deja guardar, con el motivo a la vista.
5. En Configurar, el reel ya enganchado muestra las frases de fábrica, editables.
6. El selector traduce bien: Apagado → automatización apagada; Modo prueba → activa + simulacro;
   En vivo → activa sin simulacro, y solo después de confirmar.
7. La fila muestra el modo; un reel apagado nunca dice "Publicado".
8. Un comentario que coincide recibe una de las frases del reel (con privado o de respaldo según
   corresponda), no una de fábrica.
9. Con el interruptor general apagado, Configurar lo avisa.

## Riesgos

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Pasar a En vivo sin querer le responde a clientes | 🔴 | Confirmación explícita; el default al enganchar es Apagado |
| Respuesta pública vacía o de otro reel | 🟡 | Fallback al catálogo de fábrica; se lee del reel que recibió el comentario |
| El código lee columnas que no existen | 🟡 | Migración antes del deploy; es aditiva con default |
| La pantalla muestra un texto y se manda otro | 🟡 | Un solo módulo de textos de fábrica, usado por los dos lados |

# Asistente de IA de la tasación (chat por tasación)

**Fecha:** 2026-10-03 · **Tamaño:** grande (módulo nuevo + IA + archivos + permisos) ·
**Requiere aprobación explícita del dueño antes de codear.**

## Problema y resultado

**Problema:** cuando un propietario cuestiona el precio (caso real: una propietaria mandó una
captura y sintió que era bajo), el equipo tuvo que sacar la tasación del sistema, pegarla en
ChatGPT e iterar a mano para entender y responder. Había factores de la cuadra y del sector que
el método de comparables no captura y que nadie podía discutir con el sistema.

**Resultado:** dentro de cada tasación hay un asistente que conoce esa tasación entera (datos,
comparables, coeficientes, cálculo, PDF, mercado del barrio) y con el que Diego o el asesor
pueden conversar: preguntarle cómo llegó al precio, darle contexto, mandarle capturas, fotos o
documentos, y recibir respuestas simples y bien ordenadas. Las conversaciones quedan guardadas
en la tasación.

## Principio rector: explicar simple sin ser infantil

Cada respuesta se organiza para que la entienda cualquier persona: primero la respuesta en una
frase, después los pasos en orden con los números reales, y al final qué se podría revisar. Sin
jerga sin explicar, sin ejemplos infantiles, sin relleno. Esto va en el prompt del asistente y se
prueba con casos fijos (ver "Pruebas").

## Qué ve el usuario

- **Dónde:** en la pantalla de crear/editar tasación (`/appraisal/new`) y en la ficha
  (`/appraisals/[id]`), un botón "Asistente de tasación" abre un panel. El diseño exacto sale de
  las 3 propuestas visuales (ver "Diseño").
- **Hilos:** cada tasación tiene una lista de conversaciones. Botón **"Nuevo chat"** abre otra de
  la misma tasación. Cada hilo tiene título (se genera con la primera pregunta, editable), fecha y
  autor. Recargar la página no pierde nada.
- **Mensajes:** el asesor escribe, y puede adjuntar **imágenes** (capturas, fotos) y
  **documentos** (PDF). El asistente responde con texto ordenado y, cuando explica un cálculo,
  con una tabla de los pasos con los números reales.
- **Atajos al empezar un hilo:** "¿Cómo llegó a este precio?", "¿Qué comparable pesa más?",
  "Ayudame a responderle al propietario", "¿Qué factores de la zona no está viendo el método?".
- **Propuestas de ajuste:** *(decisión del dueño, pregunta 1)* si el asistente concluye que un
  coeficiente debería cambiar (ej. ubicación del sujeto 1,00 → 1,05 por la cuadra), lo muestra
  como una tarjeta "Propuesta" con el antes/después del precio. Nada se aplica solo.
- **Si falla:** el mensaje del asesor queda guardado y aparece "No pude responder (motivo).
  Reintentar". Nunca se pierde lo escrito.
- **Roles:** lo ven quienes pueden ver esa tasación (`lib/auth/appraisal-access.ts`). El abogado
  no lo ve.

## Qué pasa por detrás

- **Una llamada de IA por mensaje** (regla dura del repo). Nada de cadenas de herramientas dentro
  de un request.
- **Paquete de contexto armado por código, no por la IA:** antes de cada llamada, el servidor
  arma desde la base: datos del sujeto y comparables, coeficientes aplicados, cálculo paso a paso
  (generado por una función pura `explicarCalculo()` con los números exactos — la IA narra esos
  números, no los recalcula), resultado clásico e IA, textos/precios del informe, datos de mercado
  congelados del barrio, y otras tasaciones de la plataforma en el mismo barrio (últimos 12 meses,
  resumidas) para comparar. Más el historial del hilo (últimos mensajes + un resumen acumulado).
- **Adjuntos:** se suben directo a Storage con URL firmada (patrón ya usado en documentos
  legales), a un bucket **privado** `appraisal-chat`. Imágenes (jpg/png/webp) y PDF, hasta 10 MB c/u.
  El modelo los recibe en la misma llamada (modelo con visión).
- **Modelo:** OpenAI con visión (variable nueva `TASADOR_CHAT_MODEL`, por defecto `gpt-4.1`, que
  ya se usa en la cuenta). El cliente de IA actual es solo texto: se agrega soporte de imágenes y
  documentos.
- **Uso y costo:** cada respuesta guarda modelo y tokens. No hay un precio verificado por mensaje;
  se mide en la prueba piloto.

### Datos (migración nueva)

- `appraisal_chat_threads`: id, appraisal_id (FK → appraisals, ON DELETE CASCADE), title,
  created_by (FK → profiles, ON DELETE SET NULL), created_at, updated_at, archived_at.
- `appraisal_chat_messages`: id, thread_id (FK, CASCADE), role (`user`|`assistant`), content,
  attachments (jsonb: path, tipo, nombre, tamaño), proposal (jsonb, opcional), status
  (`ok`|`failed`), error, model, usage (jsonb), created_by, created_at.
- RLS por rol en las dos tablas, con la misma regla de acceso que la tasación.

## Diseño

Tres propuestas visuales (panel lateral, pantalla completa con hilos, pestaña dentro de la
ficha) en un artifact de diseño, para elegir una antes de la Etapa 2.

## Qué queda afuera (v1)

- Que el asistente modifique la tasación por su cuenta.
- Que mande cosas al propietario (WhatsApp/email): solo redacta, el asesor copia.
- Buscar en internet o en portales en vivo durante el chat.
- Audio/voz.

## Pruebas

- Funciones puras (`explicarCalculo`, armado del paquete de contexto, recorte de historial) con
  vitest.
- 5 preguntas fijas sobre 3 tasaciones reales, revisadas a ojo para claridad y exactitud de
  números (cada número citado debe existir en el paquete de contexto).
- QA en la vista previa: crear hilo, adjuntar imagen y PDF, recargar, abrir segundo hilo, entrar
  con otro rol.

## Riesgos (pre-flight)

- 🔴 Tiempo de Netlify: una respuesta con PDF + visión puede acercarse al límite. Mitigación:
  tope de tiempo de 25 s, tamaño de adjuntos acotado, y el cliente lee la respuesta con un helper
  tolerante a la página de error 504.
- 🟡 Datos sensibles: capturas de chats con propietarios → bucket privado, URLs firmadas de corta
  duración, RLS.
- 🟡 Migración antes del deploy (las tablas tienen que existir antes del código).
- 🟡 Inventar números: mitigado porque los números salen de `explicarCalculo()` y el prompt
  prohíbe citar cifras que no estén en el contexto.
- 🟢 No se mandan mensajes a clientes ni se gasta en campañas.

## Preguntas abiertas

1. ¿El asistente puede **proponer** ajustes con un botón "Aplicar" (que pasa por el mismo
   recálculo y queda registrado), o en v1 solo explica y aconseja?
2. ¿Los chats de una tasación los ve todo el que ve la tasación (compartidos), o cada uno ve
   solo los suyos?

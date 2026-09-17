# Tasaciones y captaciones manuales en el CRM — Diagnóstico y spec

**Fecha:** 2026-09-17 · **Tamaño:** grande (CRM, emails, permisos, datos existentes) ·
**Pedido del dueño:** "cuando captamos una propiedad manualmente o subimos una tasación
manualmente, no le sigue el proceso y no aparece en el CRM de la misma forma".
**Estado:** esperando aprobación del dueño. No se tocó código.

---

## 1. Diagnóstico (con evidencia, verificado contra la base real el 2026-09-17)

### 1.1 Lo que NO es el problema

El CRM **no** está conectado solo a las solicitudes de tasación. Lee una sola tabla
(`deals`, vía `GET /api/deals` → `getDeals` en `lib/supabase/deals.ts`) y no excluye ningún
origen. De hecho, 56 de las 60 tasaciones de la base tienen un proceso. El problema es
**cómo se crea y se vincula ese proceso** cuando el trabajo se hace a mano.

### 1.2 Tasación manual ("Nueva tasación" del menú, sin proceso)

Después de guardar la tasación, el **navegador** intenta crear un proceso
(`app/(dashboard)/appraisal/new/page.tsx:871-961`). Ese proceso sale mal en cinco cosas:

| # | Qué pasa | Evidencia |
|---|---|---|
| 1 | **El "cliente" es la dirección.** Se crea un contacto nuevo con `full_name` = dirección, sin teléfono ni email. | `page.tsx:933`; en la base, 16 de 16 procesos manuales desde agosto (ej. contacto "Formosa 5176"). |
| 2 | **Sin asesor.** No se manda `assigned_to`. Un usuario con rol asesor solo ve en el CRM los procesos asignados a él (`lib/auth/scope.ts`, `app/api/deals/route.ts:23-27`) y recibe "sin permiso" al abrir la ficha (`canAccessDeal`). **Para los asesores estas tasaciones no existen en el CRM.** | Los 16 procesos tienen `assigned_to = null`. |
| 3 | **Origen forzado a "Histórico".** Los selectores de origen y asesor se quitaron de la tasación el 2026-04-10 (commit `b00828f`) y quedó `origin \|\| 'historico'`. Las métricas tratan "Histórico" como "sistema anterior" (464 procesos heredados). Un referido queda mezclado con la data vieja. | `page.tsx:147-148, 935`; `components/metrics/CostosPanel.tsx:16`. |
| 4 | **Saltea la visita y queda como "Entregada".** `linkAppraisalToDeal` pasa el proceso a `appraisal_sent` al vincular (`lib/supabase/deals.ts:247-259`), aunque el comentario de la ruta dice que vincular "NO avanza el stage" (`advance/route.ts:20-22`). Consecuencias: nunca se abre el formulario de visita (secciones 08/09 de portales y landing), nunca se manda el email real de "Tasación entregada", y el proceso figura entregado aunque no se entregó. | Los 16 procesos están en "Entregada" y ninguno pasó por "Visita Realizada". |
| 5 | **Manda un email falso de "Tasación agendada"** (`notifyDealCreated`) a Diego, Julián y el resto de administradores. | `email_notifications_log`: 6 de 6 procesos revisados tienen `deal_created_admins` "Tasación agendada: …". |

Además **falla en silencio**: si la creación del proceso da error, no se avisa (solo
`console.error`) y "Reintentar" no lo vuelve a intentar. Casos reales:
- **Estado de Israel 4645** (Lucas, asesor, 2026-08-24): quedó un proceso fantasma en
  "Coordinada", sin tasación vinculada, sin asesor y con la dirección como nombre. La
  tasación quedó suelta. Lucas no ve ninguno de los dos.
- **4 tasaciones sin ningún proceso** (Estado de Israel, Miranda 5217, Mosconi 543, Almafuerte 2532).
- Desde el 2026-09-14 la ruta de datos de visita exige acceso al proceso (arreglo de
  seguridad), así que para un asesor ese guardado también da "sin permiso" en este camino.
  El plan elimina este camino, así que no hay que revertir el arreglo.

### 1.3 Captación manual

| # | Qué pasa | Evidencia |
|---|---|---|
| 1 | **Captar desde la ficha de la tasación no mueve el proceso.** Solo se vincula la propiedad y se pasa a "Captada" si se entra con `?dealId=` (botón desde el proceso, `properties/new/page.tsx:325-333`). "Captar como propiedad" desde la tasación (`appraisals/[id]/page.tsx:716`) o desde la tasación agendada (`scheduled-appraisals/[id]/page.tsx:53-54`) usa `?appraisalId=`: la propiedad se crea, el proceso queda en "Entregada" para siempre y **no hereda los datos de la visita** (secciones 08/09). Además el email de captación busca el proceso por `property_id` y no encuentra coordinador. | 5 propiedades captadas cuyo proceso sigue sin propiedad: Salta 297, Perón 4227, Díaz Colodrero 2327 e **Hipólito Yrigoyen 1550 dos veces**. |
| 2 | **Nada impide captar dos veces la misma tasación.** | Hipólito Yrigoyen 1550: una ficha del 2026-09-14 (10 fotos) y otra de hoy, 2026-09-17 13:16 (20 fotos), las dos con la misma tasación. |
| 3 | **Captar desde cero** ("Propiedades → Nueva", sin tasación) no crea ni busca proceso: la propiedad no aparece nunca en el CRM. | `POST /api/properties` no toca `deals`. En la base, 25 de 30 propiedades activas no tienen proceso. 16 son la carga masiva del CSV, que es otro caso. |

### 1.4 Otros hallazgos

- **No hay cómo reasignar el asesor de un proceso** (ninguna pantalla ni ruta), así que un
  proceso creado sin asesor queda así.
- **No hay cómo vincular una tasación a un proceso existente**: la ruta
  `POST /api/deals/[id]/link-appraisal` existe pero nadie la llama.
- **"Asignar contacto" en la tasación** precarga el origen `tasacion`, que la base rechaza
  (CHECK de `contacts.origin`: embudo, referido, historico, clase_gratuita).
- **Mailchimp está apagado** (`MAILCHIMP_SYNC_ENABLED`; las 47 sincronizaciones recientes
  figuran como `skipped_disabled`). Si se prende, cualquier proceso con email entra en la
  secuencia de su etapa sin mirar el origen, incluidos los manuales.

## 2. Verificación del formulario de visita (pedido 2 del dueño)

**Funciona en producción** (verificado el 2026-09-17 con un proceso `[TEST]`, ya borrado):
"Marcar Visita Realizada" abre el formulario con las secciones 01 a 09. Las casillas de
MercadoLibre cambian por tipo: departamento 57, casa 52, PH 26. "Otro" avisa que
MercadoLibre no tiene categoría y deja seguir. También aparecen Subtipo y Estado de
Argenprop, las expensas y las 4 preguntas de la landing. El autoguardado responde 200 y la
consola queda sin errores.

**Huecos encontrados** (es el único camino que muestra 08/09):
1. La **tasación manual saltea la visita** (1.2 #4): el asesor nunca ve 08/09.
2. **Captar desde la tasación** no hereda 08/09 (1.3 #1): aunque se hayan llenado, se pierden.
3. **Una vez finalizada la visita no se pueden ver ni corregir** 08/09: el formulario solo se
   abre en "Coordinada" y la vista de solo lectura (`VisitDataView`) no muestra 08/09.
4. **"Finalizar Visita" no chequea la respuesta**: si falla, el modal se cierra igual y el
   proceso sigue en "Coordinada" sin avisar (`VisitDataForm.tsx`).
5. Lateral: el camino real (`markVisitCompleted`) no manda el email "Visita realizada" (N2);
   solo lo manda `advance`, que ninguna pantalla usa para esa etapa. Es anterior a este trabajo.

---

## 3. Qué se propone (un solo flujo, sin datos inventados, todo en el servidor)

**Principio:** todo trabajo manual entra al **mismo camino que ya funciona** para los
procesos coordinados. Al empezar se identifica a qué proceso pertenece. Si es un cliente
nuevo, se crea un proceso real (nombre, teléfono, origen, asesor) desde el servidor. De ahí
en adelante siguen los botones de siempre.

### 3.1 "Nueva tasación" sin proceso
- **Primer paso nuevo: "¿Para qué cliente es esta tasación?"**
  - **Buscar proceso existente** (por nombre, teléfono o dirección). Si se elige uno, se
    continúa exactamente como "Crear Tasación" desde la ficha del proceso (`?dealId=`).
    Esto evita los duplicados como Estado de Israel.
  - **Cliente nuevo:** propietario (nombre), teléfono, email (opcional), origen, asesor,
    dirección, tipo, barrio y ambientes. El servidor crea contacto y proceso en
    **"Visita Realizada"** (si se tasa, la visita ya ocurrió). No manda el email de
    "Tasación agendada".
- Después se abre el **formulario de visita** (secciones 01–09) para ese proceso, y recién
  ahí la tasación con `?dealId=`.
- Luego el flujo normal: "Marcar Tasación Entregada" (email real al equipo) → Seguimiento →
  "Captar Propiedad".
- Se **elimina** la creación de proceso desde el navegador (`page.tsx:871-961`).
- `linkAppraisalToDeal` **deja de cambiar la etapa**: vincular ≠ entregar.

### 3.2 Captación
- **"Captar como propiedad" desde la tasación o la tasación agendada:** el servidor busca
  el proceso de esa tasación y sigue como si se hubiera entrado desde el proceso. Vincula la
  propiedad, pasa el proceso a "Captada" y hereda 08/09. Si la tasación no tiene proceso,
  se pide elegir uno o crear el cliente (mismo bloque que 3.1).
- **"Propiedades → Nueva" desde cero:** el mismo primer paso de 3.1. El proceso nuevo se crea
  y queda en "Captada" al guardar la propiedad.
- **El vínculo propiedad ↔ proceso se hace en el servidor** (`POST /api/properties` recibe
  el proceso). Hoy es un segundo pedido del navegador que puede fallar sin avisar.
- **Freno de duplicados:** si el proceso ya tiene una propiedad activa, no se deja captar
  otra. Se muestra la ficha existente.

### 3.3 Formulario de visita
- Botón **"Datos de la visita"** en procesos ya visitados (Visita Realizada, Entregada,
  Seguimiento), para ver y corregir las secciones 01–09 sin cambiar la etapa.
- `VisitDataView` muestra también 08/09.
- "Finalizar Visita" avisa si falla y no cierra el modal.

### 3.4 Asesor y contacto
- **Reasignar asesor** desde la ficha del proceso (admin, dueño, coordinador).
- **Completar contacto** del proceso (nombre, teléfono, email) desde la ficha.
- "Asignar contacto" en la tasación deja de precargar un origen inválido.

### 3.5 Reparar lo que ya está mal (script con modo informe; se escribe recién con tu OK)
- **Las 5 captaciones desvinculadas:** se vinculan a su proceso y pasan a "Captada".
  Hipólito Yrigoyen 1550 queda afuera hasta que decidas cuál de las dos fichas se conserva.
- **Los 16+ procesos creados por tasación manual:** el script no puede inventar nombres ni
  teléfonos. Se marcan con un aviso en la ficha ("Completá propietario, teléfono, origen y
  asesor") y salen en una lista para el equipo. La etapa no se toca (probablemente se
  entregaron por fuera).
- **Las 4 tasaciones sin proceso y Estado de Israel:** se listan y se vinculan desde la
  pantalla nueva.

## 4. Qué NO se toca (lo que ya funciona)

- Landings y embudo (`create-funnel-lead`): origen embudo/clase gratuita, emails y métricas.
- "Coordinar Tasación" (`/pipeline/new`) y todo el recorrido desde la ficha del proceso.
- Formulario de visita en "Coordinada" (sigue igual y además se puede reabrir).
- Métricas del embudo (`vw_funnel_daily`, estado de resultados). Solo cuentan
  `embudo`/`clase_gratuita`, así que no cambian.
- Agente de WhatsApp (solo procesos del embudo), carga masiva del CSV, GHL en cuarentena.

## 5. Decisiones del dueño (con la recomendación)

1. **Orígenes para clientes manuales.** Hoy: Embudo, Referido, Histórico. Mencionaste
   también "gente que después nos contacta".
   *Recomendación:* agregar **"Contacto directo"**. Requiere migración (CHECK en `deals` y
   `contacts`) y etiquetas en 5 pantallas. Alternativa sin migración: usar "Referido".
2. **Etapa inicial de una tasación manual.**
   *Recomendación:* **"Visita Realizada"**. Así se llena el formulario 08/09 y el asesor marca
   "Tasación Entregada" cuando la manda. Alternativa: "Entregada" directo, perdiendo 08/09
   y el email de entrega.
3. **Hipólito Yrigoyen 1550 duplicada.** ¿Qué ficha se conserva: la del 14/9 (10 fotos,
   landing publicada) o la de hoy (20 fotos)? La otra se descarta, no se borra.
4. **Email "Visita realizada" (N2).** Hoy no sale en el flujo real.
   *Recomendación:* no cambiarlo en este trabajo (es otro tema). Queda anotado.

## 6. Criterios de aceptación

1. "Nueva tasación" sin proceso pide primero el cliente. Con "Cliente nuevo" se crea un
   proceso con nombre y teléfono reales, el origen y asesor elegidos, en "Visita Realizada".
   En la base: `contacts.full_name` es el nombre, `deals.assigned_to` es el asesor y
   `deals.stage='visited'`.
2. Ese proceso aparece en el CRM **para el asesor asignado** (probado con rol asesor) y su
   ficha abre sin "sin permiso".
3. No se manda "Tasación agendada" al crear el proceso de una tasación manual
   (`email_notifications_log` sin `deal_created_*` para ese proceso).
4. Al elegir un proceso existente, la tasación queda vinculada a él y no se crea ningún
   proceso nuevo.
5. Guardar una tasación vinculada **no cambia la etapa**. "Marcar Tasación Entregada" la pasa
   a "Entregada" y manda el email de entrega al equipo.
6. "Captar como propiedad" desde la tasación vincula la propiedad a su proceso, lo pasa a
   "Captada" y hereda expensas, `portal_data` y `landing_answers`.
7. "Propiedades → Nueva" pide el cliente y termina con un proceso en "Captada" vinculado.
8. Intentar captar de nuevo un proceso que ya tiene propiedad activa muestra la ficha
   existente y no crea otra.
9. En un proceso "Entregada", "Datos de la visita" abre el formulario con 08/09, guarda y no
   cambia la etapa.
10. "Finalizar Visita" con error de red deja el modal abierto con un mensaje.
11. Un administrador reasigna el asesor desde la ficha y el nuevo asesor ve el proceso en su CRM.
12. El recorrido de siempre (landing → solicitud → coordinada → visita → tasación → entregada
    → captada) sigue igual: probado de punta a punta con datos `[TEST`.
13. El script de reparación en modo informe lista los casos. Con `--commit` deja las 4
    captaciones vinculadas (sin Hipólito) y la base lo confirma.

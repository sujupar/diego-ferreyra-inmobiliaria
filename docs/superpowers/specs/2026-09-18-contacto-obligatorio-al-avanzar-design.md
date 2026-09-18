# Datos del cliente obligatorios para crear y para avanzar un proceso

Fecha: 2026-09-18 · Pedido del dueño · Tamaño: mediano (toca varias rutas y el flujo del CRM)

## 1. Qué se pide y para qué

Ningún proceso de tasación o captación puede nacer ni avanzar de etapa sin los datos
completos del cliente: nombre real, teléfono, email y asesor. Para qué: que todo lo que
el equipo trabaja se pueda contactar y le aparezca a su asesor en el CRM — hoy hay
procesos con la dirección como nombre, sin teléfono ni email, que nadie puede llamar.

Decisiones del dueño (2026-09-18):
- Al CREAR: los datos son obligatorios, sí o sí.
- Procesos que YA existen incompletos: no se frenan hasta que alguien los quiera mover a
  la etapa siguiente; en ese momento se piden los datos que falten, de forma obligatoria.
- **El email es 100% obligatorio** (igual que el teléfono).
- Supuesto (recomendado, sin objeción del dueño): **Descartar** y **No se realizó la
  visita** NO piden datos — exigirlos para cerrar un proceso muerto invita a inventarlos.

## 2. Lo que encontramos (medido contra la base, 2026-09-18)

- **200 procesos abiertos**; **190 quedarían frenados** la próxima vez que alguien
  quiera avanzarlos: 139 solo por falta de asesor, 25 sin teléfono+email+asesor (la
  tasación manual vieja), 22 solo sin email, 3 sin email+asesor, 1 sin contacto.
- Por etapa: Coordinada 57 de 60, No realizada 7/7, Visita realizada 8/9 (todas por
  email), Entregada 21/23, En seguimiento 97/101.
- **Las 92 solicitudes del embudo tienen email válido**: el embudo no se traba.
- Lo único que cambia la etapa de un proceso: los botones de la ficha
  (`/api/deals/[id]/advance`), "Finalizar Visita" (`/api/deals/[id]/visit-data`) y
  "Captar propiedad" (`POST /api/properties`). El tablero del CRM no permite arrastrar.
  El agente de WhatsApp mueve el pipeline de COMPRADORES, no estos procesos.
- Puertas de creación: tasación/captación manual (`POST /api/deals/manual`, hoy el
  email es opcional) y **"Coordinar tasación"** (`POST /api/deals`, hoy solo exige
  nombre y dirección: teléfono, email y asesor son opcionales).
- `contacts.email` no tiene restricción de unicidad: completar un email no choca.

## 3. Qué ve el usuario

**Al crear** (Nueva tasación → Cliente nuevo, Captar desde cero → Cliente nuevo, y
Coordinar tasación): nombre, teléfono, email y asesor pasan a ser obligatorios. Si falta
alguno, el formulario no se envía y dice cuál. Un asesor solo crea procesos a su nombre.

**Al avanzar** un proceso incompleto (Marcar Visita Realizada / Finalizar Visita,
Marcar Tasación Entregada, Seguimiento, Captar Propiedad, Marcar como Captada,
Reagendar Visita): en vez de avanzar, se abre una ventana **"Completá los datos del
cliente para avanzar"** con los campos que faltan (los que ya están, precargados y
editables). Al guardar, la acción que se había pedido se hace sola. Si cierra la ventana
sin guardar, el proceso queda donde estaba y no se pierde nada de lo cargado (en la
visita, lo escrito queda guardado).

- Si falta el asesor: admin, dueño y coordinador lo eligen en esa misma ventana. (Un
  asesor nunca ve procesos sin asesor: solo ve los suyos.)
- El aviso amarillo de la ficha pasa a incluir el email ("le falta el teléfono y el
  email") y su botón abre la misma ventana.
- **No piden datos:** Descartar, No se realizó la visita, y agregar otro seguimiento a un
  proceso que YA está en seguimiento (no es moverlo de etapa).

## 4. Qué pasa por detrás

- Regla pura y testeada: qué falta (`nombre`, `telefono`, `email`, `asesor`) y qué
  movimientos exigen datos (hacia Coordinada desde No realizada, Visita Realizada,
  Entregada, Seguimiento, Captada). Una sola regla para el servidor, la ventana, el aviso
  y el script de reparación.
- **El servidor es la barrera**, no el botón: las tres rutas que mueven etapas verifican
  los datos antes de mover y, si faltan, responden `422` con la lista de lo que falta y
  NO mueven nada. En "Finalizar Visita" los datos de la visita se guardan igual.
  "Captar propiedad" con proceso incompleto no crea la ficha hasta completar.
- Ruta nueva para guardar los datos del cliente de un proceso en un solo pedido
  (actualiza el contacto o lo crea y lo vincula; asigna asesor solo con permiso de ver
  todo el pipeline). Mismas validaciones que al crear.
- Sin migraciones. Sin emails nuevos. Los emails que ya dispara cada avance (visita
  realizada, tasación entregada) salen cuando el avance efectivamente ocurre.

## 5. Qué queda afuera

- **Convertir una solicitud del embudo en "Coordinada".** Hoy la ficha de una solicitud
  no tiene botón para coordinarla: "Coordinar tasación" crea OTRO proceso, y así quedan
  personas repetidas (se vieron 32 en el informe de ayer). Se propone como trabajo aparte.
- Completar en masa los 190 procesos: se completan de a uno, cuando alguien los mueve.
- Contactos de compradores y consultas de portales: la regla es de los procesos de
  tasación/captación, no de todo contacto.
- Verificar que el email exista de verdad: se valida el formato, no la casilla.

## 6. Criterios de aceptación

1. En "Nueva tasación → Cliente nuevo", sin email el proceso no se crea y el formulario
   dice "Falta el email". Con todos los datos, se crea como hoy.
2. En "Coordinar tasación", sin teléfono, sin email o sin asesor no se crea el proceso.
3. Un proceso en Coordinada sin email: al tocar "Finalizar Visita" aparece la ventana
   pidiendo el email; al guardarlo, la visita se finaliza sola y el proceso queda en
   Visita Realizada con el email en su contacto.
4. Un proceso en Entregada sin teléfono: "Seguimiento" y "Captar Propiedad" piden el
   teléfono antes de avanzar; cerrando la ventana, el proceso sigue en Entregada.
5. "Descartar" y "No se realizó la visita" funcionan sin pedir nada.
6. Un proceso sin asesor, movido por un admin: la ventana pide elegir el asesor; al
   guardar, el proceso queda asignado y avanza.
7. Un pedido directo a la API para avanzar un proceso incompleto responde que faltan
   datos y la etapa en la base no cambia.
8. Una solicitud nueva del embudo entra igual que hoy (misma etapa, mismos emails).
9. Captar desde la ficha de una tasación cuyo proceso está incompleto pide los datos
   antes de crear la ficha; completados, la ficha se crea y el proceso queda Captada.

## 7. Riesgos anotados (pre-flight)

- **190 procesos abiertos van a pedir datos** la próxima vez que se muevan: es el
  objetivo, pero el equipo lo va a notar de golpe. Conviene avisarles.
- Inventar datos para pasar el control (un email falso): se mitiga validando formato y
  largo del teléfono; no se puede eliminar del todo.
- Productores/consumidores de la regla de faltantes: aviso de la ficha, script de
  reparación y las tres rutas usan la MISMA función.
- Permisos: la ruta nueva exige acceso al proceso (`canAccessDeal`); cambiar el asesor,
  `pipeline.view_all`. El abogado no entra.
- Sin límite de tiempo en juego (sin IA), sin migración, sin mensajes a clientes.

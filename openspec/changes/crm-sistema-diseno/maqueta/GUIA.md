# Guía de la maqueta CRM

Referencia para quien arma una pantalla. Todo lo de acá ya existe en `base.css` y `base.js`: usalo tal cual, no lo redefinas.

## 1. Archivos y armado

| Archivo | Qué es |
| --- | --- |
| `shell.html` | Esqueleto: menú lateral, barra superior (campanita + conmutador de rol), `<main id="contenido">`, barra inferior. Tiene tres marcadores: `<!-- ESTILOS -->`, `<!-- PANTALLAS -->`, `<!-- SCRIPTS -->`. **No lo edites** desde una pantalla. |
| `base.css` | Tokens de `app/globals.css` + todos los componentes compartidos. |
| `base.js` | Router, rol, hojas, desplegables, pestañas, toast y el store `window.MQ`. |
| `pantallas/<nombre>.html` | Fragmento (sin `<html>` ni `<body>`) con tu `<section data-screen="nombre">` y, si hace falta, sus hojas al lado. |
| `pantallas/<nombre>.css` | Opcional. Solo estilos propios, con prefijo de la pantalla (`.ficha__…`, `.inicio__…`). |
| `pantallas/<nombre>.js` | Opcional. Envuelto en `(function(){ … })();`. |
| `armar.py` | `python3 armar.py` → genera `index.html` autocontenido (CSS y JS en línea). Orden: inicio, ficha, tareas, estados, resto alfabético. |
| `ver.html` | Visor para capturas (no se publica). Ver §8. |

Pantallas previstas: `inicio`, `ficha`, `tareas`, `estados`, más `campanita` (no es una sección: es una hoja global, ver §6).

## 2. Convención de una pantalla

```html
<section class="pantalla" data-screen="tareas" data-titulo="Pendientes" data-seccion="Mi día">
  <div class="pagina">  <!-- ancho máx. 80rem, margen 16 px (24 desde 768), columna con gap 16 -->
    …
  </div>
</section>
```

- `data-titulo` va a la barra superior; `data-seccion` (opcional) es el renglón chico de arriba. Para cambiarlo en vivo: `MQ.setTitulo('Marcela Ibáñez', 'Contactos')`.
- El router muestra la sección cuyo `data-screen` coincide con `location.hash` (`#inicio`, `#ficha`, `#tareas`, `#estados`); cualquier otro hash cae en `inicio`. Las demás quedan con `hidden`.
- Quien scrollea es `#contenido`, no el `body`. Para algo pegado arriba dentro de tu pantalla: `position: sticky; top: 0`.
- Si no usás `.pagina` (la ficha a todo el ancho), tu raíz debe tener `width: 100%` y nada puede medir más que la pantalla: `#contenido` recorta el desborde horizontal.
- Navegar: `<a href="#tareas">`, o `data-ir="tareas"` en cualquier elemento, o `MQ.ir('tareas')`.
- Abrir la ficha de alguien: `<a href="#ficha" data-contacto="c2">Rubén</a>` o `MQ.abrirFicha('c2')`. Poné `data-contacto` solo en el elemento clickeable.
- Íconos: escribí `<i data-icono="phone"></i>`; `base.js` lo cambia por el SVG al arrancar. Si insertás HTML después, usá `MQ.ui.icono('phone')` al armar el texto o llamá `MQ.ui.hidratar(nodo)`.
- Por rol: `data-solo-rol="coordinadora admin"` oculta el elemento para los demás roles (CSS puro). El rol está en `document.body.dataset.rol` y `MQ.rol`: `coordinadora` | `asesor` | `admin`.
- Tu JS corre después de `base.js` y **antes** de la primera navegación: suscribite con `MQ.on(...)` y dibujá en `'pantalla'`, `'rolchange'`, `'tareas'`, `'actividad'` y `'contacto'` según corresponda.
- Prohibido en el visor final: `alert/confirm/prompt`, `fetch`, imágenes remotas, `localStorage`. Usá `toast()` y hojas.

## 3. Breakpoints y medidas

Mobile first. Base = 390 px. `@media (min-width: 768px)`, `(min-width: 1024px)`, `(min-width: 1280px)`.

| Ancho | Shell |
| --- | --- |
| < 768 | Barra inferior visible (`--barra-inferior-h` ≈ 56 px), menú como panel deslizable, botones y campos de 44 px, campos con letra de 16 px. |
| 768–1023 | Sin barra inferior; menú como panel deslizable; botones de 36 px. |
| ≥ 1024 | Menú lateral fijo de 240 px (`--menu-w`). **El contenido mide viewport − 240**: a 1280 quedan 1040 px, a 1024 quedan 784 px. |

Variables útiles: `--tap` (44 px), `--ctl` (alto de control: 44 en celular, 36 desde 768), `--pad` (16/24), `--topbar-h` (56), `--barra-inferior-h`, `--radius-sm/md/lg/xl`, `--sombra`, `--sombra-flotante`.
Colores: solo los tokens (`--brand`, `--brand-soft`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`, `--destructive`, `--card`, `--background`, `--foreground`, `--muted-foreground`) y tres mezclas derivadas: `--texto-suave` (gris legible para texto chico), `--destructive-suave`, `--destructive-texto`. No agregues colores.
Utilidades: `.solo-celular` (se oculta desde 768), `.solo-escritorio` (se oculta bajo 768), `.fila`, `.fila--entre`, `.fila--envuelve`, `.pila`, `.pila--chica`, `.pila--grande`, `.crece`, `.truncar`, `.texto-suave`, `.texto-chico`, `.eyebrow`, `.titulo-pagina`, `.titulo-bloque`, `.numero`, `.numero-grande`, `.divisor`, `.solo-lectores`, `.icono--20`, `.icono--24`, `.enlace`.

## 4. Componentes (HTML mínimo)

**Card**
```html
<div class="card">
  <div class="card__cabecera"><h2 class="card__titulo">Tareas</h2><button class="btn btn--fantasma btn--chico"><i data-icono="plus"></i>Tarea</button></div>
  <div class="card__cuerpo">…</div>
  <div class="card__pie">…</div>   <!-- opcional -->
</div>
```
Variantes: `card--plana` (sin sombra), `card--marca` (borde azulado).

**Botón** — `btn` (primario carbón), `btn--marca` (azul, la acción principal de llamar/guardar), `btn--secundario`, `btn--fantasma`, `btn--peligro`, `btn--icono` (cuadrado, **siempre con `aria-label`**), más `btn--chico`, `btn--ancho`, `btn--redondo`.
```html
<button type="button" class="btn btn--marca"><i data-icono="phone"></i>Llamar</button>
<button type="button" class="btn btn--icono btn--secundario" aria-label="Posponer"><i data-icono="clock"></i></button>
<a class="btn btn--marca" href="tel:+5491155550142"><i data-icono="phone"></i>11 5555-0142</a>  <!-- MQ.fmt.tel(c.telefono); mostrá siempre el número como texto -->
```
Botón flotante (solo celular, queda arriba de la barra inferior): `<button class="fab" aria-label="Agregar nota o llamada" data-abrir-hoja="hoja-mas"><i data-icono="plus"></i></button>`

**Badge y etapa**
```html
<span class="badge">Texto</span>  <!-- + badge--marca | badge--suave | badge--borde | badge--alerta | badge--numero -->
<span class="badge etapa" data-etapa="solicitud">Solicitud de tasación</span>   <!-- o MQ.ui.chipEtapa('solicitud') -->
```
Etapas: `solicitud`, `agendada`, `visita`, `entregada`, `captada`, `perdida` (textos en `MQ.ETAPAS`).

**Chip de resultado de llamada** (ícono + texto siempre) — `MQ.ui.chipResultado('no_atendio')` o:
```html
<span class="resultado" data-resultado="no_atendio"><i data-icono="phone-missed"></i>No atendió</span>
```
| clave | texto largo | corto | ícono |
| --- | --- | --- | --- |
| `agendo` | Atendió y agendó | Agendó | `calendar-check` |
| `volver` | Atendió · volver a llamar | Volver a llamar | `phone-forwarded` |
| `no_interesa` | Atendió · no le interesa | No le interesa | `thumbs-down` |
| `no_atendio` | No atendió | No atendió | `phone-missed` |
| `equivocado` | Número equivocado | Número equivocado | `phone-off` |

**Opción grande** (para elegir el resultado con un toque; 52 px de alto en celular)
```html
<button type="button" class="opcion" aria-pressed="false" data-resultado="no_atendio">
  <span class="opcion__icono"><i data-icono="phone-missed"></i></span>No atendió
</button>
```
Elegida: `aria-pressed="true"`. Admite un `<small>` de segunda línea.

**Avatar** — `<span class="avatar" aria-hidden="true">MI</span>` o `MQ.ui.avatar('Marcela Ibáñez', 'grande')`. Tamaños: `avatar--chico`, (normal), `avatar--grande`; `avatar--neutro` gris.

**Campo**
```html
<label class="campo"><span class="campo__etiqueta">Día</span><input class="entrada" type="date"><span class="campo__ayuda">…</span></label>
<textarea class="entrada" placeholder="Escribí una nota…"></textarea>
```
Error: `aria-invalid="true"` en la entrada + `<span class="campo__error"><i data-icono="triangle-alert"></i>Elegí día y hora</span>`.

**Pestañas** (base.js las maneja: selección, paneles, flechas del teclado)
```html
<div class="pestanas pestanas--iguales" role="tablist" aria-label="Secciones de la ficha">
  <button class="pestana" role="tab" aria-selected="true" aria-controls="ficha-actividad">Actividad</button>
  <button class="pestana" role="tab" aria-selected="false" aria-controls="ficha-datos">Datos</button>
</div>
<div id="ficha-actividad" role="tabpanel">…</div>
<div id="ficha-datos" role="tabpanel" hidden>…</div>
```
Variante `pestanas--segmento` (pastilla gris, para Nota | Registrar llamada). Al cambiar, el tablist emite el evento DOM `pestana` con `detail.id`. Los `id` de los paneles son globales: prefijalos con tu pantalla.

**Filtros** (uno activo a la vez; emite el evento DOM `filtro` con `detail.valor`)
```html
<div class="filtros" aria-label="Filtrar la línea de tiempo">
  <button class="filtro" aria-pressed="true" data-valor="todo">Todo</button>
  <button class="filtro" aria-pressed="false" data-valor="llamadas">Llamadas</button>
</div>
```

**Hoja inferior (sheet)** — desde abajo en celular, diálogo centrado desde 768.
```html
<div class="hoja" id="hoja-llamada" role="dialog" aria-modal="true" aria-labelledby="hoja-llamada-t" hidden>
  <div class="hoja__fondo" data-cerrar-hoja></div>
  <div class="hoja__panel">
    <div class="hoja__cabecera"><h2 class="hoja__titulo" id="hoja-llamada-t">Registrar llamada</h2>
      <button type="button" class="btn btn--icono" data-cerrar-hoja aria-label="Cerrar"><i data-icono="x"></i></button></div>
    <div class="hoja__cuerpo">…</div>
    <div class="hoja__pie"><button class="btn btn--secundario" data-cerrar-hoja>Cancelar</button><button class="btn btn--marca" data-foco>Guardar</button></div>
  </div>
</div>
```
Abrir: `data-abrir-hoja="hoja-llamada"` en cualquier botón, o `abrirHoja('hoja-llamada')`. Cerrar: `data-cerrar-hoja`, Esc, o `cerrarHoja('hoja-llamada')`. `data-foco` marca qué recibe el foco al abrir. Eventos DOM: `hoja:abierta`, `hoja:cerrada`. Se cierran solas al cambiar de pantalla.
Modificadores: `hoja--completa` (pantalla completa en celular) y `hoja--panel` (desde 768, panel de 384 px anclado bajo la barra superior a la derecha, sin oscurecer el fondo). La campanita usa los dos: `class="hoja hoja--completa hoja--panel"`.
Una hoja va **junto** a tu `<section>` en el mismo fragmento (o adentro, si es solo de esa pantalla).

**Panel desplegable** (menú flotante; se cierra al elegir, al tocar afuera o con Esc)
```html
<div class="desplegable">
  <button type="button" class="btn btn--secundario" data-desplegable-btn aria-expanded="false">Posponer<i data-icono="chevron-down"></i></button>
  <div class="desplegable__panel" hidden>  <!-- + desplegable__panel--izquierda para alinearlo a la izquierda -->
    <div class="desplegable__titulo eyebrow">Posponer</div>
    <button type="button" class="desplegable__item">1 hora</button>
    <button type="button" class="desplegable__item">Mañana 9:00</button>
  </div>
</div>
```
Ojo: el panel es `position: absolute`; dentro de un contenedor con `overflow` se recorta. En celular, para opciones preferí una hoja.

**Sección plegable**
```html
<details class="plegable"><summary>Sin fecha <span class="badge badge--numero">2</span></summary><div class="plegable__cuerpo">…</div></details>
```

**Lista con separadores** — `<ul class="lista">…</ul>` (línea entre hijos). **Dato** — `<div class="dato"><span class="dato__etiqueta">Barrio</span><span class="dato__valor">Caballito</span></div>`.

**Item de línea de tiempo** — usá `MQ.ui.itemEvento(evento, { nuevo: true })`. Genera:
```html
<ul class="linea-tiempo">
  <li class="evento" data-tipo="llamada" data-evento="a10">
    <span class="evento__icono"><svg…/></span>
    <div class="evento__cuerpo">
      <p class="evento__titulo"><span>Llamada 1 ·</span><span class="resultado" data-resultado="no_atendio">…No atendió</span></p>
      <p class="evento__detalle">Texto de la nota o comentario (opcional)</p>
      <p class="evento__meta"><span>Paula</span><span aria-hidden="true">·</span>
        <time class="fecha" datetime="2026-11-24T10:15" title="mar 24 nov 2026, 10:15" data-relativa="ayer" data-exacta="mar 24 nov 2026, 10:15" tabindex="0" role="button">ayer</time></p>
    </div>
  </li>
</ul>
```
`data-tipo`: `registro`, `llamada`, `nota`, `whatsapp`, `etapa`, `tarea`, `video`, `email`, `tasacion`, `consulta`. La fecha (`MQ.ui.fecha(iso)`) muestra la exacta en `title` y, al tocarla, cambia entre relativa y exacta. `evento--nuevo` lo resalta 1,6 s.

**Item de tarea** — usá `MQ.ui.itemTarea(tarea, { acciones: '<button…>', sinContacto: false, conPersona: false })`. Genera:
```html
<ul class="lista">
  <li class="tarea" data-tarea="t1" data-estado="vencida">
    <label class="tarea__check"><input type="checkbox" data-completar="t1" aria-label="Completar: Llamar a Marcela Ibáñez"><span class="tarea__caja"><svg…/></span></label>
    <div class="tarea__cuerpo">
      <p class="tarea__titulo"><svg…/><span class="truncar">Llamar a Marcela Ibáñez</span></p>
      <p class="tarea__meta"><span class="vence" data-estado="vencida"><svg…/>Vencida hace 1 h</span>
        <a class="tarea__contacto" href="#ficha" data-contacto="c1">Marcela Ibáñez</a></p>
    </div>
    <div class="tarea__acciones">…botones opcionales…</div>
  </li>
</ul>
```
El checkbox con `data-completar` **ya funciona solo**: completa la tarea en el store, muestra el toast «Tarea completada · Deshacer» y emite `'tareas'`. Vos solo volvé a dibujar la lista al recibir ese evento. `data-estado`: `vencida` | `hoy` | `proxima` | `sinfecha`. El vencimiento siempre es ícono + texto (`MQ.ui.vence(t)`).

**Estados de un bloque**
```js
bloque.innerHTML = MQ.ui.estadoCarga(3);                       // filas esqueleto (.esqueleto, --titulo, --corto, --medio, --circulo, --bloque)
bloque.innerHTML = MQ.ui.estadoVacio({ icono: 'circle-check', titulo: 'Todo al día', texto: 'No hay tareas para ahora.', ok: true, accion: '<button class="btn btn--secundario">Crear tarea</button>' });
bloque.innerHTML = MQ.ui.estadoError({ texto: 'No pudimos traer las tareas.' });   // trae <button data-reintentar>Reintentar</button>: escuchá su click
```
HTML: `<div class="estado estado--error|estado--ok">` con `estado__icono`, `estado__titulo`, `estado__texto`. Con error nunca se muestra un cero.

**Toast** — `toast('Nota guardada')` o `toast('Tarea completada', { accion: 'Deshacer', alAccionar: fn, ms: 6000 })`. También `data-toast="texto"` en un elemento.

**Campanita** — el botón `#btn-campanita` y su número (tope «99+», se oculta en cero) ya están en el shell y se actualizan solos con `MQ.avisos()`. La pantalla campanita solo hace: `MQ.on('campanita', function () { abrirHoja('hoja-campanita'); })`. Mientras nadie escuche, el botón lleva a `#tareas`.

**Íconos disponibles** (`data-icono` / `MQ.ui.icono`): `menu`, `panel-left`, `bell`, `phone`, `phone-missed`, `phone-forwarded`, `phone-off`, `calendar`, `calendar-check`, `calendar-days`, `clock`, `check`, `circle-check`, `x`, `plus`, `chevron-right`, `chevron-left`, `chevron-down`, `message-circle`, `sticky-note`, `user`, `user-plus`, `users`, `arrow-right-left`, `arrow-right`, `list-checks`, `circle-play`, `mail`, `layout-dashboard`, `inbox`, `columns`, `contact`, `building`, `house`, `triangle-alert`, `refresh`, `thumbs-down`, `file-text`, `paperclip`, `map-pin`, `pencil`, `megaphone`, `eye`, `briefcase`, `external-link`, `filter`, `more`, `layers`. Si falta uno, agregalo al objeto `ICONOS` de `base.js` (trazo 24×24, sin relleno).

## 5. `window.MQ` — el store

El reloj está **fijo**: `MQ.ahora()` es siempre miércoles 25/11/2026 10:40. No uses `new Date()` para "ahora". Las fechas son textos `"AAAA-MM-DDTHH:MM"` en hora local (`MQ.iso(date)`, `MQ.dia(-1, '10:15')` = ayer 10:15).

**Forma exacta de una tarea** (`MQ.tareas[]`)
```js
{ id: 't1', titulo: 'Llamar a Marcela Ibáñez',
  tipo: 'llamada',            // 'llamada' | 'whatsapp' | 'visita' | 'tasacion' | 'otro'   (MQ.TIPOS_TAREA)
  contactoId: 'c1',           // o null
  vence: '2026-11-25T09:00',  // o null = sin fecha
  todoElDia: false,
  asignadaA: 'paula',         // 'paula' | 'tomas' | 'admin'
  estado: 'pendiente',        // 'pendiente' | 'completada'
  automatica: true,           // la creó la cadencia
  creada: '2026-11-24T18:20', completada: null }
```

**Forma exacta de un evento de actividad** (`MQ.actividad[]`)
```js
{ id: 'a24', contactoId: 'c2',
  tipo: 'llamada',            // 'registro' | 'llamada' | 'nota' | 'whatsapp' | 'etapa' | 'tarea' | 'video' | 'email' | 'tasacion' | 'consulta'
  titulo: 'Llamada 1',        // una línea
  detalle: null,              // texto de la nota / comentario, o null
  autor: 'Paula',             // nombre, o null si lo hizo la persona o el sistema
  fecha: '2026-11-24T10:15',
  orden: 24,                  // desempate interno
  // solo en llamadas:
  resultado: 'no_atendio',    // 'agendo' | 'volver' | 'no_interesa' | 'no_atendio' | 'equivocado'
  intento: 1,
  // solo en whatsapp:
  origen: 'manual' }          // 'manual' (alguien marcó "WhatsApp enviado") | 'sistema'
```

**Contacto** (`MQ.contactos[]`): `{ id, nombre, telefono, email, etapa, origen, campana, asesor, asignadoA, barrio, tipoPropiedad, ambientes, direccion, background, creado }`.
**Tasación agendada** (`MQ.tasaciones[]`): `{ id, contactoId, direccion, fecha, asesor }`.

**Lecturas**
| Llamada | Devuelve |
| --- | --- |
| `MQ.rol`, `MQ.usuario()` | rol actual; `{ id, nombre, rol, rolTexto }` |
| `MQ.contacto(id)`, `MQ.contactoActual()`, `MQ.contactoActualId` | el contacto; el de la ficha abierta (por defecto `c1`) |
| `MQ.actividadDe(contactoId)` | eventos, del más nuevo al más viejo |
| `MQ.tareasDe(contactoId)` | tareas pendientes de ese contacto |
| `MQ.misTareas(usuarioId?)` | pendientes del rol actual, por vencimiento |
| `MQ.avisos(usuarioId?)` | lo que cuenta la campanita (vencidas o de ahora; nunca las sin fecha) |
| `MQ.grupoDeTarea(t)` | `'vencida'` \| `'hoy'` \| `'proxima'` \| `'sinfecha'` |
| `MQ.llamadasDe(id)`, `MQ.diasSinContacto(id)` | llamadas; días desde la última (o `null` si nunca) |
| `MQ.cadenciaDe(id)` | `{ llamadas, noAtendioSeguidas, whatsappEnviado }` |
| `MQ.tarea(id)`, `MQ.nombreDe(usuarioId)` | |

**Escrituras** (todas avisan con eventos)
| Llamada | Qué hace |
| --- | --- |
| `MQ.registrarLlamada({ contactoId, resultado, nota?, volverEl? })` | Guarda la llamada, completa las tareas de llamada pendientes de esa persona y aplica la cadencia. Devuelve `{ evento, intento, tareaCreada, tareasCompletadas, aviso }` (`aviso` es el texto listo para el toast). `volverEl` es obligatorio con `'volver'` (si falta, tira error). |
| `MQ.registrarWhatsapp(contactoId, nota?)` | Marca «WhatsApp enviado» (no envía nada), completa las tareas pendientes de llamada y WhatsApp, no crea ninguna. Devuelve lo mismo, con `tareaCreada: null`. |
| `MQ.agregarNota(contactoId, texto)` | Devuelve el evento. |
| `MQ.crearTarea({ titulo, tipo?, contactoId?, vence?, todoElDia?, asignadaA? })` | Devuelve la tarea. |
| `MQ.completarTarea(id)`, `MQ.reabrirTarea(id)`, `MQ.posponerTarea(id, vence)` | |
| `MQ.setRol(rol)`, `MQ.ir(pantalla)`, `MQ.abrirFicha(contactoId)`, `MQ.setTitulo(titulo, seccion?)` | |

**Cadencia que ya está programada en `registrarLlamada`**
1. Una «No atendió» → tarea «Llamada N+1 a {nombre}» para el día hábil siguiente a las 9:00 (hoy es miércoles: jueves 26, 9:00).
2. Dos «No atendió» seguidas → tarea «Enviar WhatsApp a {nombre}», día hábil siguiente 9:00.
3. Con el WhatsApp ya marcado → otra «No atendió» no crea nada.
4. «Volver a llamar» → tarea «Llamar a {nombre}» en `volverEl`. Los otros resultados no crean tarea.
Cuando crea una tarea agrega a la línea de tiempo «Tarea creada sola · …», y la llamada queda **primera**.

**Eventos** — `MQ.on(evento, fn)`:
| Evento | Dato | Cuándo |
| --- | --- | --- |
| `'pantalla'` | nombre | cada navegación (también la primera) |
| `'rolchange'` | rol | al cambiar de rol (también al arrancar). También evento DOM `rolchange` en `document` |
| `'tareas'` | `{ motivo, tarea, completadas? }` | motivo: `creada`, `completada`, `reabierta`, `pospuesta`, `cadencia` |
| `'actividad'` | `{ motivo, evento }` | motivo: `llamada`, `nota`, `whatsapp` |
| `'contacto'` | contactoId | cambió la ficha abierta |
| `'campanita'` | — | tocaron la campanita |

**Formato** — `MQ.fmt.relativa(f)` («hace 1 h», «ayer», «mañana 9:00»), `MQ.fmt.exacta(f)` («mar 24 nov 2026, 10:15»), `MQ.fmt.vencimiento(t)` → `{ texto, estado }`, `MQ.fmt.hora(f)`, `MQ.fmt.diaCorto(f)`, `MQ.fmt.iniciales(nombre)`, `MQ.fmt.tel(telefono)`. `MQ.ui.esc(texto)` para escapar lo que escribe el usuario.

## 6. Datos sembrados

Usuarios: `paula` (Paula, coordinadora), `tomas` (Tomás Agüero, asesor), `admin` (Dueño). Paula arranca con 6 avisos en la campanita, Tomás con 1 y el admin con 0 (sirve para mostrar «todo al día»).

| id | Persona | Propiedad | Situación |
| --- | --- | --- | --- |
| c1 | **Marcela Ibáñez** (la ficha) | Depto 3 amb, Caballito | Solicitud de ayer 18:20, anuncio de Meta. **Sin llamadas**: en ella se prueba la cadencia entera. Tarea «Llamar» vencida hace 1 h. |
| c2 | Rubén Castiglione | Casa 4 amb, Villa Urquiza | Llamada 1 «No atendió» ayer 10:15; tarea «Llamada 2» de hoy 9:00 |
| c3 | Silvina Arrieta | PH 3 amb, Almagro | 2 «No atendió»; tarea «Enviar WhatsApp» |
| c4 | Gustavo Peralta | Depto 2 amb, Palermo | 2 «No atendió» + WhatsApp hace 2 días: sin respuesta, sin tareas |
| c5 | Lorena Quiroga | Depto 4 amb, Belgrano | «Volver a llamar»; tarea hoy 16:30 |
| c6 | Ernesto Villalba | Casa 5 amb, Flores | «Agendó»; etapa agendada; tasación mañana 11:00 con Tomás |
| c7 | Patricia Medrano | Depto 3 amb, Núñez | Entró hoy 10:12, sin primer contacto |
| c8 | Hugo Benítez | PH 2 amb, Boedo | «No le interesa»; perdida |
| c9 | Nélida Ferrari | Casa 3 amb, Parque Chacabuco | «Número equivocado» |

La línea de tiempo de c1 no tiene llamada ni cambio de etapa hasta que se registra una; esos ejemplos están en c2–c9 (c6 tiene llamada, etapa y tasación).

## 7. Reglas que valen para todas las pantallas

- Castellano rioplatense, simple. Datos ficticios; teléfonos `11 5555-01xx`.
- Sin scroll horizontal en 390, 1024 ni 1280. En celular, todo lo tocable mide 44 × 44 o más, y los campos usan `.entrada` (16 px).
- Ningún significado solo por color: ícono + texto.
- Todo botón visible hace algo (aunque sea un toast que explique). Una sección sin datos no se muestra, salvo que ofrezca crear el primero.
- En la ficha no hay «enviar mensaje» ni «enviar email». Sí: Nota, Registrar llamada y, adentro, «Marqué WhatsApp enviado».
- Registrar «No atendió» desde la ficha en celular: «+» → Registrar llamada → No atendió = 3 toques.

## 8. Ver tu trabajo

Chrome sin ventana no baja de 500 px de ancho: una captura directa a 390 sale recortada. Usá `ver.html`, que mete la maqueta en un marco del ancho pedido. Copiá la carpeta a un directorio sin tildes, armá y capturá:

```bash
python3 armar.py
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files --window-size=390,844 --virtual-time-budget=4000 \
  --screenshot=salida.png "file:///ruta/sin/tildes/ver.html?w=390&h=844&p=ficha"
```
Parámetros de `ver.html`: `w`, `h`, `p` (pantalla), `q` (query para tu propio JS de prueba, con `&` escrito `%26`), `src` (por defecto `index.html`). Para ver una pantalla larga entera, subí `h` (por ejemplo 2300).

## 9. Cambios de la ronda 1 de correcciones (mandan sobre lo de arriba si se contradicen)

- **Hojas apiladas.** `abrirHoja` pone cada hoja nueva arriba de las ya abiertas (z-index 61, 62…) y Esc cierra la de arriba. Así «Posponer» funciona al primer toque desde la campanita.
- **Un solo formulario de tarea.** `#tareas-hoja-nueva` (tareas.html). Desde la ficha: `MQ.nuevaTarea({ contactoId })`. Ya no existe `#ficha-hoja-tarea`.
- **Un solo catálogo de tipos.** `MQ.TIPOS_TAREA` + `MQ.TIPOS_ELEGIBLES` = Llamada, Mensaje, Visita, Documentación, Otro (los nombres del formulario de tareas de la plataforma). La clave interna de «Mensaje» sigue siendo `whatsapp`; `tasacion` se agrupa en «Visita». Un filtro con 0 tareas no se muestra.
- **La pantalla `#tareas` se llama «Pendientes»** en menú, barra, título y enlaces («Ver todos los pendientes»), como en la plataforma. Cada ítem sigue siendo una «tarea».
- **Toast.** Uno solo a la vez; se cierra al cambiar de pantalla y, en celular, al abrir una hoja. Si la pantalla tiene `.fab`, `body.con-fab` lo sube por encima del «+». «Deshacer» mide 44 px en celular. `MQ.cerrarToasts()`.
- **Fechas.** En pantallas táctiles toda la fila sirve para ver la fecha exacta: cualquier `.evento`, o un bloque con `data-fecha-fila`.
- **Registrar desde el Inicio.** `<a data-contacto="c2" data-registrar>` o `MQ.abrirFicha('c2', { registrar: true })` abre la ficha con «Registrar llamada» ya abierto.
- **Colores de alerta.** `--destructive-texto` y `--destructive-suave` se mezclan en `srgb` (en `oklch` el rojo se corría al magenta). No mezclar `--destructive` en oklch.
- **Lo que no se mide no va en la ficha.** «Abrió el email», «hizo clic» y «leyó el WhatsApp» solo están en `#estados`, en un recuadro que dice que dependen del cambio 3.
- **Datos.** c4 ahora es de Embudo · Tasación. Nuevos: c10 Mirta Sosa (visita realizada) y c11 Jorge Altamirano (tasación entregada), los dos de Tomás. El admin se rotula «Vista del dueño».
- **Ficha.** La cabecera dice «Última llamada: hace N días» (alerta solo en etapa Solicitud). Una tarea de tipo `tasacion` no se lista en Tareas si la persona ya tiene su tarjeta «Tasaciones agendadas». En la hoja del celular, «Guardar llamada» queda pegado abajo.
- **#estados.** Los nombres técnicos (`.estados-codigo`) están ocultos hasta tildar «Para quien programa».

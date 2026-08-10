# Sistema móvil — cómo está hecho y cómo no romperlo

**Fecha:** 2026-08-10 · **Rama:** `feat/plataforma-movil` sobre `bba5ac2`
**Alcance:** las 39 pantallas del panel + el Inbox rediseñado como app de mensajería.

---

## 1. La decisión que ordena todo

El código venía escrito para escritorio: 227 reglas `md:`, 126 `sm:`. **No se invirtió.** El piso móvil se agrega con la variante **`max-md:`**, que solo aplica por debajo de 768px.

Consecuencia práctica, y es el contrato del sistema: **de 768px para arriba, nada cambia.** Si tocás algo y el escritorio se ve distinto, el cambio está mal hecho — salvo las doce excepciones deliberadas de la §5.

Corolario para quien escriba una pantalla nueva: **no hace falta "hacerla responsive"**. Escribila para escritorio como siempre y las reglas base se encargan del piso. Solo agregás `max-md:` donde el layout de escritorio realmente no sirva en angosto.

---

## 2. Los breakpoints

| Nombre | Ancho | Qué decide |
|---|---|---|
| `max-xs` | < 375 | Todo a una columna. Los datos de la ficha bajan a 2 por fila. |
| `xs` | ≥ 375 | El iPhone moderno más chico. **No lo borres:** lo usan `VisitDataForm` (8 usos) y `PropertyKeyStats`. Borrarlo compila esas clases a nada, en silencio. |
| `sm` | ≥ 640 | Teléfono apaisado / tablet chica. Encabezados que pasan de apilados a fila. |
| **`md`** | **≥ 768** | **La línea dura.** Menú panel vs riel, lista-o-chat vs lista-y-chat, tabla vs fichas, 16px vs 14px en campos, 44px vs 36px de área táctil. |
| `lg` | ≥ 1024 | Entra la tercera zona: el panel del cliente se acopla en vez de flotar. |

**`md` (768) es el único corte que además existe en JavaScript**, en `hooks/use-mobile.ts`. Si algún día se mueve uno, hay que mover el otro **en el mismo commit** — si no, el sistema miente: la clase dice una cosa y el `useIsMobile()` otra.

---

## 3. Las reglas base — el bloque de `globals.css`

Está después del `@layer base`. Tres cosas que hay que entender antes de tocarlo:

**Lo que tiene que ganarle a una clase de Tailwind va SIN `@layer`.** Todo lo que emite Tailwind vive dentro de `@layer`, y el CSS sin capa le gana sin importar la especificidad. Es lo único que puede corregir ~131 controles con `text-sm` escrito a mano sin editarlos uno por uno. **Si movés esas reglas adentro de una capa, dejan de aplicar.** Lo mismo vale para el bloque `@media print`.

**`overflow-x: clip`, nunca `hidden`.** `hidden` convierte al elemento en contenedor de scroll y rompe el `sticky` de la barra superior. `clip` no.

**Las utilidades disponibles**, en vez de reinventarlas:

| Utilidad | Para qué |
|---|---|
| `h-app` / `min-h-app` / `max-h-app` | Alto real de la ventana visible. **No uses `100vh` ni `100dvh`**: `dvh` sigue la barra del navegador pero **no el teclado**, así que el compositor queda tapado. |
| `scroll-pane` | Un contenedor que scrollea solo él, sin arrastrar la página. |
| `scroll-x-fade` | Fila que se desliza de costado, con degradado en los extremos. **Fijale el color con `[--scroll-fade-color:var(--loQueHayaDetrás)]`** o vas a pintar parches. |
| `pb-safe` / `pt-safe` / `px-safe` | Respeta el notch y la barra de gestos. Todo lo pegado abajo lo necesita. |
| `tap` | Área táctil de 44px sin agrandar el dibujo. |
| `tabla-ficha` / `tabla-desliza` | Las dos formas de una tabla en angosto. |

---

## 4. Las tres piezas grandes

### El alto de la ventana

`#contenido` es el scroller, dentro de un `SidebarInset` con `h-app overflow-hidden`. La ventana ya no scrollea. `hooks/use-viewport-height.ts` publica `--app-vh` desde el **visual viewport**, que es el único que se achica cuando sube el teclado.

**Lo que esto arrastra, y ya está resuelto:** `ContentScrollReset` lleva el contenido al tope al navegar (el navegador ya no lo hace solo); `PropertyTabsNav` pasó a `top-0`; la ficha de propiedad scrollea `#contenido` además de `window`; y hay un `@media print` que devuelve el alto automático, porque si no **imprimir sale una sola pantalla**.

**Si agregás una pantalla que imprime, que scrollea sola, o que necesita alto completo**, mirá esas cuatro contracaras antes.

### La tabla que se vuelve ficha

Una sola vez en `components/ui/DataTable.tsx`, no siete veces. Cada columna declara su rol y el componente arma la ficha apilada.

El umbral se mide **sobre la caja, no sobre la ventana** (consulta de contenedor a 40rem). Efecto que conviene saber: una ventana de escritorio de menos de ~930px también pasa las tablas a fichas. Es deseable, pero sorprende si no lo esperás.

Las tres tablas de métricas viven dentro de tarjetas angostas: ahí el modo ficha está apagado a propósito.

### El Inbox

Con un chat abierto en celular: **no se dibujan la barra de filtros ni el bloque de pestañas y título**, y la tarjeta va a sangre. Eso devuelve unos 330px — el hilo pasa de 0-50px a ~380px.

**El chat vive en la dirección** (`/inbox?tab=whatsapp&chat=<teléfono>`), con `pushState`. Por eso el gesto de volver cierra el chat en vez de sacarte del Inbox, y la conversación se puede compartir por link. **No lo devuelvas a `useState`.**

Los colores salen de los tokens `--chat-*`. El verde y el crema son **decisión explícita del dueño**: se parece a un mensajero porque lo parecido no hay que aprenderlo. Cambiar la paleta es cambiar esas variables, nada más.

---

## 5. Lo que sí cruza a escritorio

Doce cosas, todas deliberadas:

1. **La ventana ya no scrollea** — el cambio grande. Los carteles de modo prueba y suplantación quedan fijos arriba (antes se iban con el scroll).
2. `overflow-x: clip` en el `body`.
3. `overflow-wrap: anywhere` en el contenido: un token largo parte a mitad de palabra en vez de ensanchar su caja.
4. Las tablas anchas esconden la barra de scroll (quedan las sombras y shift+rueda).
5. `container-type` en las fichas de tabla: esas cajas pasan a ser bloque contenedor de posicionados absolutos.
6. El umbral de ficha es por caja: ventanas chicas de escritorio también ven fichas.
7. Los diálogos tienen techo de alto y scroll interno.
8. **Un mensaje entrante ya no te arranca el hilo de las manos** mientras releés, y hay botón para bajar al último. Era un defecto también en escritorio.
9. Los separadores del chat dicen "Hoy" y "Ayer".
10. El `Stepper` tiene relleno para que el realce del paso activo no salga cortado (layout neutro: los márgenes negativos lo compensan).
11. Los degradados de las filas deslizables toman el color de lo que tienen detrás.
12. `scheduled-appraisals/[id]` perdió su `container`: va a ancho completo en monitores anchos.

**Deuda conocida, no tocada:** el riel del menú lateral sale impreso. Es anterior a este trabajo (`fixed inset-y-0 md:flex`, y el ancho de papel entra en `md:`). Si se quiere sacar, es una línea dentro del mismo `@media print`.

---

## 6. Reglas para el que agregue algo nuevo

- **Ningún campo de texto por debajo de 16px en celular.** La regla base cubre `input`, `textarea` y `select`. Un control propio queda afuera: ponele `text-base md:text-sm` a mano. Con menos de 16px, iOS hace zoom al enfocar **y no lo deshace al salir**.
- **Todo botón de solo ícono lleva `aria-label`.** No es opcional.
- **Área táctil de 44px** en cualquier cosa que se toque. Si el diseño no da, usá `tap`, que agranda el blanco sin agrandar el dibujo.
- **Nada scrollea de costado a nivel página.** El contenido ancho scrollea dentro de su propio contenedor.
- **Cualquier cosa pegada abajo lleva `pb-safe`**, o queda debajo de la barra de gestos.
- **No bloquees el zoom.** `maximumScale` y `userScalable` están prohibidos, y hay un test que lo fija. Si un gesto propio llama a `preventDefault`, chequeá `e.touches.length > 1` primero — un pellizco no es tu gesto.
- **Medí el contraste, no lo estimes.** Ya se colaron tres textos por debajo del mínimo, dos de ellos en verde sobre verde.
- **Verificá el CSS compilando**, no leyendo: `node scratchpad/compile-css.mjs` corre postcss sobre `globals.css`. `next build` no arranca en esta carpeta por el acento de "Gestión", así que es la única forma de saber si `@utility` y `@theme` están bien.

---

## 7. Lo que ningún test puede cerrar

Turbopack no compila local, así que **nada de esto se vio en un navegador**. Lo que hay que probar con un teléfono real, ordenado por riesgo:

1. **El chat con el teclado abierto** — que el compositor quede pegado arriba del teclado y el hilo pierda alto, no que se vaya de cuadro.
2. **Tirar para actualizar** en la lista — que no se dispare al scrollear rápido, y que el pellizco para hacer zoom siga funcionando.
3. **El gesto del borde para volver** en iOS, y el botón de atrás en Android: los dos tienen que cerrar el chat, no sacarte del Inbox.
4. **La barra inferior** — que no tape nada y que desaparezca al abrir un chat.
5. **Sacar una foto** desde la ficha de una propiedad, parado en la calle.
6. **Imprimir una tasación** desde escritorio: tiene que salir el informe entero.

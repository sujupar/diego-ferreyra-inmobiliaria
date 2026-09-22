# Reels: varias palabras por reel y cuentas de prueba

**Fecha:** 2026-09-22 · **Tamaño:** mediano (migración + lógica + pantallas) ·
**Antecedente:** [2026-09-22-reels-instagram-design.md](2026-09-22-reels-instagram-design.md) (PR #24, en producción).

## Problema

1. **Con una sola palabra, a la mayoría no se le responde.** El reel del 20/09 (Doblas 248, Caballito)
   pedía comentar "PARQUE RIVADAVIA". De los 21 comentarios que devuelve Instagram, **solo 3** la usaron:
   6 escribieron "doblas", 4 "info", 4 "precio". Con el sistema actual, 18 de 21 no habrían recibido nada.
2. **El dueño quiere probar con sus propias cuentas antes que con clientes.** Hoy solo hay dos
   modos por reel: simulacro (no le escribe a nadie) o encendido (le escribe a todos). Falta un
   punto intermedio: "respondele de verdad a MI cuenta, y a los demás solo registralos".

## Resultado esperado

Cada reel acepta varias palabras, y mientras está en simulacro les responde de verdad solamente a
las cuentas de prueba. Al resto de la gente la registra sin escribirle.

## Parte 1: varias palabras por reel

**Qué ve el usuario.** En los tres diálogos (subir, enganchar y configurar), el campo
"Palabra del llamado a la acción" pasa a llamarse **"Palabras que activan la respuesta"**, con la
ayuda *"Separalas con coma. La primera es la que va en la descripción."* y el ejemplo
`parque rivadavia, doblas, info`. La fila del reel muestra `palabras: PARQUE RIVADAVIA · doblas · info`.

**Qué pasa por detrás.**
- Se guarda en la MISMA columna `property_reels.palabra_clave` (texto), separada por comas. No
  se cambia su tipo: todos los que la leen siguen funcionando, y el formato de lista vive en UNA
  función pura (`separarPalabras`) que usan todos.
- Al guardar se limpia: se sacan los espacios de más, se descartan las vacías y las repetidas
  (se comparan sin tildes ni mayúsculas) y el tope es de **10 palabras y 200 caracteres**. Una lista
  que queda vacía se guarda como `null`, igual que hoy, y sin palabra no se puede activar.
- **Coincide** si el comentario contiene CUALQUIERA de las palabras, entera, con las reglas de hoy:
  da igual si tiene tilde o mayúsculas, la ñ se respeta y "impropiedades" no cuenta como "propiedad".
- La **descripción** del reel usa solamente la primera palabra ("Comentá la palabra PARQUE RIVADAVIA…").

## Parte 2: cuentas de prueba

**Qué ve el usuario.** No hay pantalla nueva. La lista la configura Claude por script, como pasa
hoy con los interruptores. El dueño comenta desde su cuenta de prueba y ve aparecer la respuesta
pública debajo de su comentario.

**Qué pasa por detrás.**
- Columna nueva `instagram_ajustes.cuentas_de_prueba text[] NOT NULL DEFAULT '{}'`: nombres de
  usuario de Instagram, sin `@` y en minúscula.
- **Regla:** cuando el reel está en **simulacro** y el comentario viene de una cuenta de prueba, se
  lo trata como si el simulacro estuviera apagado y recibe la respuesta real. Todos los demás siguen
  en simulacro: se registran y no se les manda nada. Con el simulacro apagado, la lista no cambia nada.
- La excepción va DESPUÉS de todos los descartes: interruptor global, reel activo, comentario
  anterior a la activación, comentario propio y que no coincida la palabra. Una cuenta de prueba que
  comenta sin la palabra se ignora igual que cualquiera.
- **Falla cerrado:** si el aviso llega sin nombre de usuario, si la lista no se puede leer o si el
  nombre no está exacto en la lista, NO es cuenta de prueba y queda en simulacro.
- Los interruptores globales no cambian: con la automatización global apagada no pasa nada, y con
  los privados apagados la cuenta de prueba recibe solo la respuesta pública, la que no promete un
  privado.

## Qué queda afuera

- **El botón del privado para las cuentas de prueba.** Cuando alguien toca el botón, el aviso de
  Instagram trae un identificador de chat y no el nombre de usuario, y hay que verificar contra
  Instagram con qué se cruza. Se resuelve cuando llegue el token con `pages_messaging`, que es
  cuando se prueba el privado.
- Una pantalla para administrar las cuentas de prueba.
- Palabras distintas según la plataforma o el horario.

## Criterios de aceptación

1. En el diálogo de configurar, escribir `parque rivadavia, doblas, info` y guardar deja en la base
   `palabra_clave = 'parque rivadavia, doblas, info'`. La fila del reel muestra las tres.
2. Escribir `doblas, DOBLAS, , info` guarda `doblas, info`: sin la repetida ni la vacía.
3. Once palabras, o más de 200 caracteres, se rechazan con un mensaje claro y no se guarda nada.
4. Con las palabras `parque rivadavia, doblas`, un aviso con el comentario "Doblas precio" coincide
   y uno con "Parque Rivadavía!" también. Uno con "info" no coincide.
5. La descripción armada con `parque rivadavia, doblas` dice "Comentá la palabra PARQUE RIVADAVIA" y
   no menciona "doblas".
6. Con el reel en simulacro y la cuenta `X` en la lista de prueba, un comentario de `X` con la
   palabra recibe la respuesta pública real, y en la base queda `simulado = false` con su respuesta.
7. En el mismo reel, un comentario de otra cuenta con la palabra queda con `simulado = true` y no se
   le manda nada.
8. Un comentario de `X` sin la palabra se ignora (`no_coincide`).
9. Un aviso sin nombre de usuario no se trata como cuenta de prueba: queda en simulacro.
10. Con la automatización global apagada, ni siquiera `X` recibe respuesta.

## Riesgos (pre-flight)

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Se le responde a un cliente real durante la prueba | 🔴 | El simulacro sigue siendo el default. La excepción es solo por nombre exacto, falla cerrado y va después de todos los descartes. |
| El código lee `cuentas_de_prueba` antes de que exista la columna | 🟡 | La migración se aplica ANTES del deploy. Si no estuviera, `leerAjustes` falla cerrado y apaga todo. |
| Un consumidor lee `palabra_clave` como si fuera una sola palabra | 🟡 | Se revisaron todos: `decision.ts`, `descripcion.ts`, `edicion.ts`, `servicio.ts`, las 2 rutas, los 3 diálogos y `ReelFila`. Todos pasan por `separarPalabras`. |
| Meta no entrega avisos de la cuenta de prueba (app en modo desarrollo) | 🟡 | Se ve en la primera prueba: si no aparece la fila en `reel_comentarios`, el aviso no llegó. Se diagnostica antes de seguir. |
| Prefijo de migración duplicado | 🟢 | El último es `20260922000002`; esta va como `20260922000003`. |

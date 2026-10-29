# Sesión rápida: validar la sesión sin viajar a Supabase en cada pedido

**Fecha:** 2026-10-29 · **Tamaño:** grande (toca permisos de toda la plataforma) · **Requiere OK del dueño antes de codear.**

## 1. Qué se pide y para qué
El dueño pidió bajar el "segundo mínimo" que cuesta cualquier pedido a la plataforma. Sirve para que todas las pantallas —no solo Consultas— abran y respondan más rápido: el equipo las usa desde el celular, muchas veces por día.

## 2. Medido en producción (2026-10-29, mediana de 8 pedidos alternados, misma sesión)

| Pedido | Mediana | Qué hace |
|---|---|---|
| `/api/version` | **0,23 s** | nada: viaje a Netlify y arranque de la función |
| `/api/auth/me` | **0,74 s** | lo mismo + validar la sesión 2 veces + leer el perfil |
| `/api/consultas` | **0,92 s** | lo de arriba + leer las consultas |

**La sesión agrega ~0,5 s a cada pedido.**

**Por qué cuesta eso:** cada validación es un viaje al servidor de autenticación de Supabase (`supabase.auth.getUser()`, ~0,17 s) y se hacen en fila.
- **Un pedido a una ruta:** valida en el middleware, vuelve a validar en la ruta (`getUser` de `lib/auth/get-user.ts`) y lee el perfil (rol y si está activo).
- **Abrir una página del panel:** valida en el middleware, en el layout y en la página, y lee el perfil dos veces.

**Por qué no alcanza con cambiar `getUser` por `getClaims`:** el proyecto firma las sesiones con la clave compartida vieja (HS256). El listado de claves públicas de Supabase (`/auth/v1/.well-known/jwks.json`) está **vacío**, y con esa clave `getClaims` viaja igual al servidor.

**El piso de ~0,23 s** (viaje y arranque de la función) es de Netlify y no se toca acá.

## 3. Qué ve el usuario
Nada distinto, salvo que todo responde más rápido. Estimación a partir de las mediciones:

| Qué | Hoy | Después |
|---|---|---|
| Pedido a una ruta (`/api/...`) | ~0,74 s | ~0,40 s |
| Abrir una página del panel | — | ~0,5–0,8 s menos |

## 4. Qué pasa por detrás

### Parte A — sin tocar Supabase (se puede hacer ya)
- **`getUser` una sola vez por pedido:** se envuelve en `cache()` de React, así layout y página comparten la misma validación y la misma lectura del perfil. No cambia ninguna regla: es el mismo resultado, calculado una vez.
- **Lo que gana:** al abrir una página, una validación y una lectura del perfil menos (~0,35 s).

### Parte B — con una acción del dueño en Supabase (5 minutos, en el Dashboard)
1. **El dueño pasa el proyecto a claves de firma asimétricas.** Project Settings → JWT Keys → "Migrate JWT secret" y después "Rotate keys". Supabase lo diseñó sin corte:
   - las sesiones abiertas siguen valiendo hasta vencer, porque la clave vieja queda como "anterior" y se sigue aceptando;
   - las claves `anon` y `service_role` del código siguen funcionando.
   - **Lo que NO hay que hacer después:** "revocar" la clave vieja. Eso sí rompería esas dos claves. Queda escrito en CLAUDE.md.
2. **El código pasa de `getUser()` a `getClaims()`** en el middleware y en `lib/auth/get-user.ts`. `getClaims` verifica la firma **localmente** con la clave pública (que se descarga una vez y queda en memoria): **cero viajes para validar la sesión.**
3. **El perfil se sigue leyendo en cada pedido.** Rol e `is_active` tienen que estar siempre al día: desactivar a alguien lo frena en el siguiente pedido, como hoy.
4. **Sin variables de entorno nuevas.**

## 5. Lo que cambia en seguridad (decisión del dueño)
- **Hoy:** cada pedido le pregunta a Supabase si la sesión sigue viva. Una sesión cerrada desde otro lado ("cerrar sesión en todos los dispositivos") muere al instante.
- **Con la Parte B:** la sesión se verifica por su firma. Una sesión robada o cerrada en otro dispositivo sigue valiendo **hasta que vence su token (1 hora en Supabase)**.
  - Es el comportamiento estándar que Supabase recomienda.
  - Desactivar un usuario o cambiarle el rol **sigue siendo inmediato**, porque eso sale del perfil, que se lee siempre.
  - Cerrar sesión en el propio navegador borra el token: sigue siendo inmediato.
- Si el dueño no acepta esa hora de margen, se hace solo la Parte A.

## 6. Qué queda afuera
- El piso de Netlify (~0,23 s: distancia y arranque de la función).
- Guardar el perfil en caché entre pedidos: atrasaría desactivar a alguien.
- Cambiar qué rutas validan qué: los permisos quedan exactamente igual.

## 7. Criterios de aceptación
1. Las pruebas de permisos que ya existen pasan sin cambios: sin sesión → 401/login; inactivo → afuera; rol sin permiso → 403.
2. **Parte A:** abrir una página del panel hace UNA validación de sesión y UNA lectura de perfil en el servidor, no dos. Se prueba con una prueba sobre `getUser` y se mide en la vista previa.
3. **Parte B:** con las claves migradas, `/api/auth/me` baja de ~0,74 s a ≤ 0,45 s de mediana en producción (8 pedidos alternados con `/api/version`), y el middleware no llama más a `/auth/v1/user`.
4. **Parte B:** un usuario desactivado queda afuera en el pedido siguiente; un token adulterado o vencido → 401 o login.
5. **Parte B:** las claves `anon` y `service_role` siguen funcionando, verificado con una lectura de cada una después de la rotación.
6. Impersonación de admin y modo prueba: siguen igual.

## 8. Riesgos (pre-flight)
- **Toca la puerta de toda la plataforma.** Se publica primero en la vista previa, se prueba con los cuatro roles, y el revert queda listo (un solo commit).
- **Orden de la Parte B:** primero el dueño rota las claves y se verifica que el listado de claves públicas ya no esté vacío; recién después va el código.
  - Al revés no rompe nada: `getClaims` con HS256 vuelve a viajar al servidor, igual que hoy.
- **El código actual que pide `getUser`** desde componentes de cliente (navegador) no cambia: esto es solo servidor.

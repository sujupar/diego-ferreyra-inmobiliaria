# Consultas Entrega 2 — Plan

**Spec:** `docs/superpowers/specs/2026-10-29-consultas-rapidas-y-estadisticas-design.md` (aprobado 2026-10-29).
**Rama:** `feat/consultas-rapidas-y-estadisticas` desde `origin/main` (6ceed2ea).
**Ejecución:** nativa (una sesión, tarea por tarea), revisión adversarial de la rama entera al final.
**Pruebas:** `npx vitest run -c vitest.consultas.config.ts` · tipos: `npx tsc --noEmit -p tsconfig.consultas.json`.

## Reglas globales
- Autor `Sujupar <redstyle50@gmail.com>`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Reglas en `lib/consultas/*` puras y testeadas primero (TDD). Las rutas son finas.
- Nada se manda a clientes. QA solo sobre datos `[TEST`.

## Tareas

### 1. Lectura en un viaje: `consultas_del_periodo`
- **Migración `supabase/migrations/20261029000002_consultas_del_periodo.sql`:** función
  `consultas_del_periodo(p_desde timestamptz, p_hasta timestamptz, p_usuario uuid, p_limite int) returns jsonb`.
  - Es `LANGUAGE sql STABLE SECURITY INVOKER`.
  - Devuelve `{consultas, visitas, propiedades, asesores, truncado}`, con las consultas ordenadas por `recibida_at` desc e `id` desc, y `limit p_limite + 1` para detectar el corte.
  - `REVOKE ALL ... FROM PUBLIC, anon, authenticated` y `GRANT EXECUTE` solo a `service_role`.
- **Aplicación:** `scripts/apply-consultas-del-periodo-pg.ts` aplica la migración y verifica tres cosas:
  1. el mismo conteo que la vista para 30 días;
  2. que `authenticated` no tenga `EXECUTE`;
  3. que con `p_limite` chico devuelva `truncado`.
- **`lib/consultas/datos.ts`:** `leerPeriodo(f)` reemplaza a `consultasDelPeriodo`, `visitasParaConsultas` y `propiedadesYAsesores`.
- **`lib/consultas/servicio.ts`** (solo servidor): `cargarPeriodo({ rol, usuarioId, desde, hasta, etiqueta })` devuelve `PeriodoConsultas` = `{ periodo, consultas: ConsultaEnBandeja[], truncado }`.
- **`GET /api/consultas`:** devuelve `PeriodoConsultas`. Prueba de ruta: 401/403, el alcance del asesor y la forma de la respuesta.

### 2. Filtrar y paginar en memoria: `lib/consultas/vista.ts`
- **`vistaBandeja(consultas, filtros, { verTodo, visibles })`** devuelve `{ filas, total, tarjetas, porPortal, porPropiedad }`, con la misma semántica que la Entrega 1:
  - los selectores se cuentan sin su propio filtro;
  - las tarjetas, antes del filtro de estado y de teléfono.
- **Búsqueda** sin tildes ni mayúsculas (NFC + sin diacríticos), con todas las palabras obligatorias. Busca en nombre, teléfono, email, dirección del aviso, dirección de la propiedad y mensaje. Una palabra de solo números se compara también contra los dígitos del teléfono.
- **`armarBandeja`** pasa a recibir `visibles` en vez de `pagina`.
- **Pruebas:** cada filtro, `sin` propiedad y asesor, búsqueda con NFD, regex `2*D`, dígitos, conteos, y 3.000 filas en < 50 ms.

### 3. Filtros sin ir al servidor
- **`useFiltrosUrl({ ..., soloNavegador: true })`** escribe con `window.history.replaceState`, que Next sincroniza con `useSearchParams` sin pedir la página.
- **Prueba:** con la opción no se llama a `router.replace`; sin la opción, igual que hoy.

### 4. Pantalla armada en el servidor + caché por período
- **`page.tsx`:** `requireAuth`, lee el período de `searchParams` (`leerFiltrosConsultas`), y en paralelo `cargarPeriodo` y asesores (solo si ve todo). Todo dentro de `<Suspense>` con el esqueleto.
- **`ConsultasClient`** recibe `{ yo, asesores, inicial }`:
  - guarda los períodos en un `Map` por `desde|hasta`;
  - un período nuevo hace UN pedido y deja el anterior atenuado mientras carga;
  - después de agendar o conectar refresca el período actual;
  - "Ver más" suma 25 a `visibles`.
- **Pruebas** (`page.test.tsx`): sin `fetch` al montar, el filtro no pide nada, el período pide una vez, y volver a un período ya visto no pide.

### 5. Conectar avisos
- **`lib/consultas/avisos.ts`** (puro):
  - `codigoAgrupable(portal, codigo)`: no agrupa vacío, `https`, nada con `/` o `:`, ni un número de 9 dígitos en ZonaProp.
  - `tituloDelAviso(portal, asunto, direccion)`.
  - `agruparAvisos(filas)`: ordenados por cantidad, con la última fecha.
  - `resumenSinPropiedad(consultas)` devuelve `{ consultas, avisos }` para el aviso de arriba.
- **`identificar.ts`:**
  - `conectarAviso(sb, { portal, codigo, propertyId })`: con asesor, `identificarAviso`; sin asesor, solo actualiza las consultas.
  - `conectarConsulta` recuerda siempre que el código sea agrupable y devuelve `{ actualizadas, recordado, agrupable }`.
- **Rutas:**
  - `GET /api/consultas/avisos-sin-propiedad` y `POST /api/consultas/avisos/conectar`, solo operaciones.
  - `POST /api/consultas/[id]/propiedad` ignora `recordar`.
- **Lector de ZonaProp:** `CÓD:` seguido de una URL ya no se toma como código.
- **Pruebas** de cada pieza.

### 6. Pantalla de avisos
- **`BuscadorDePropiedades`:** sale de `HojaElegirPropiedad` y lo comparten las dos hojas.
- **`HojaElegirPropiedad`:** sin casilla; dice antes si se conecta todo el aviso o solo esa consulta, y después cuántas se conectaron.
- **Aviso arriba de la lista** «⚠ N consultas de M avisos no tienen propiedad · Conectar avisos», solo para operaciones.
- **`HojaAvisosSinPropiedad`:** la lista de avisos; al tocar uno, el buscador con las sugeridas, la confirmación con el conteo, y Conectar.
- **Pruebas** de componente: el aviso visible solo para operaciones, la confirmación muestra el conteo, conectar llama a la ruta y refresca.

### 7. Estadísticas
- **`lib/consultas/estadisticas.ts`** (puro, `Cifra` de `lib/visitas/metricas.ts`):
  - tarjetas;
  - el recorrido con el paso más angosto;
  - por portal, por propiedad, por mes, por canal y por asesor.
- **`components/consultas/EstadisticasConsultas.tsx`** y pestaña activa. Tocar una propiedad pasa a la Bandeja con ese filtro; tocar "Sin propiedad" abre la hoja de avisos.
- **Pruebas** del módulo y render de la pestaña (vacío → "Sin datos"; base < 20 → "orientativo").

### 8. Cierre
- CLAUDE.md § Sección Consultas, la memoria, y el borrado de los `scripts/_qa-*`.

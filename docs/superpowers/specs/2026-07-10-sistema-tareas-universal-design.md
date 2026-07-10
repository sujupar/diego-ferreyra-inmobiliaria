# Sistema de tareas universal por usuario — Diseño

**Fecha:** 2026-07-10
**Estado:** Aprobado (pendiente review del spec)

## Problema

Hoy una tarea de seguimiento (llamar/email/mensaje con fecha y hora) solo se puede
crear desde el modal "Seguimiento" del pipeline (`app/(dashboard)/pipeline/[id]/page.tsx`),
acoplado al avance de etapa. Se necesita que **cualquier usuario, desde cualquier
prospecto (contacto, deal, propiedad, tasación) o de forma suelta, pueda agendar una
tarea** (tipo, fecha, hora) que le quede en sus **Pendientes** — experiencia estilo
Follow Up Boss.

## Contexto: lo que YA existe (no rehacer)

- **Tabla `tasks`** con: `id, type, title, description, assigned_to, deal_id, appraisal_id,
  property_id, contact_id, status, created_at, completed_at, due_date, due_time, all_day,
  created_by, channel`. `type` CHECK incluye `follow_up`; `channel` CHECK = `{call,email,message}`.
- **`lib/supabase/tasks.ts`**: `createTask` (dedupe salvo follow_up), `getMyTasks`
  (pendientes que vencen hoy o antes, oculta futuras), `completeTask`, `dismissTask`.
- **`POST /api/tasks`**: ya crea `follow_up` con validación (canal, fecha ≥ hoy, hora si no
  all_day) y default `assigned_to`/`created_by` = usuario actual.
- **`GET /api/tasks?user_id=&status=`** + página **`/tasks` ("Pendientes")** que renderiza
  con badges de canal, fecha/hora, completar/descartar y link de vuelta a la entidad
  (`getTaskLink`).

Conclusión: el backend está ~90% listo. Esto es **ubicuidad de UI + extensiones aditivas**.

## Alcance (decisiones aprobadas)

1. **Asignación:** a uno mismo (default) **o a otro usuario**. Asignar a otro requiere rol
   `admin`/`dueno`/`coordinador`; `asesor` solo se auto-asigna.
2. **Superficies:** desde cada prospecto (contacto, deal, propiedad, tasación) **+ tareas
   sueltas** (botón global en Pendientes, sin entidad).
3. **Tipos:** ampliar de 3 canales a `{Llamada, Email, Mensaje, Visita, Documentación, Otro}`.

## Diseño

### 1. Datos — migración aditiva `20260710000001_tasks_universal.sql`

- Ampliar `tasks_channel_check` para permitir `{call, email, message, visit, document, other}`.
- **Sin más cambios de schema.** El resto de columnas ya existe.
- El nombre de columna `channel` se conserva (renombrar rompería todo el código que la usa);
  en la UI se rotula **"Tipo"**. Deuda de nombre documentada; rename limpio = refactor futuro
  aparte.
- Aditiva: filas y flujos existentes intactos (el modal de pipeline sigue mandando
  `call/email/message`, siguen siendo válidos).

### 2. Backend

**`POST /api/tasks` (extender, compatible hacia atrás):**
- `title` obligatorio (string 1..200).
- `channel` (Tipo) obligatorio para tareas de usuario; ∈ set ampliado.
- Entidad **opcional**: 0 o 1 de `deal_id/property_id/appraisal_id/contact_id` (UUID válido).
  Si viene, se valida que exista (best-effort) para no crear links colgados.
- `assigned_to`: default = usuario actual. Si `assigned_to !== user.id`, exigir
  `user.role ∈ {admin,dueno,coordinador}` (si no → 403). Validar que el destinatario exista y
  esté activo.
- Mantener validación follow_up existente: `due_date` requerida y ≥ hoy; `due_time` requerida
  si `all_day === false`; normalizar `all_day=true → due_time=null`.
- `type` se fuerza a `'follow_up'` para creación desde este flujo (no permitir setear los
  tipos de sistema como `new_assignment` desde el cliente).

**Nuevo `GET /api/users/assignable`:**
- `requireAuth`. Devuelve usuarios activos `{id, full_name, role}` (excluye `abogado` del
  destino de tareas comerciales; incluye admin/dueno/coordinador/asesor).
- Se usa para poblar el selector "Asignar a". La UI solo muestra el selector si el rol del
  usuario puede asignar a otros; igual el server reautoriza (defensa en profundidad).

**`GET /api/tasks` / `getMyTasks`:** sin cambios. Tareas sueltas (sin entidad) y futuras se
comportan igual que hoy.

### 3. Frontend

**`components/tasks/AddTaskDialog.tsx` (reutilizable):**
- Props: `{ entity?: { kind: 'deal'|'property'|'appraisal'|'contact'; id: string; label?: string };
  trigger?: ReactNode; defaultAssignee?: string; onCreated?: (taskId: string) => void }`.
- Campos: **Tipo** (6 opciones), **Título** (req.), **Nota** (opcional), **Fecha** (default hoy),
  **Todo el día / Hora**, **Asignar a** (solo si el rol puede; default = yo).
- Estado propio; usa primitivos `dialog/select/input/textarea/label/button` ya presentes.
- POST a `/api/tasks`; toast de éxito/error (sonner); `onCreated` para refrescar la lista.
- Carga usuarios asignables (lazy, al abrir) desde `/api/users/assignable` solo si el rol
  puede asignar a otros. Rol propio vía `/api/auth/me`.

**Puntos de integración (botón "Agregar tarea" con el dialog):**
- `app/(dashboard)/contacts/[id]/page.tsx` → `entity={kind:'contact'}`
- `app/(dashboard)/pipeline/[id]/page.tsx` → `entity={kind:'deal'}` (además del modal de
  Seguimiento existente, que NO se toca)
- `app/(dashboard)/properties/[id]/page.tsx` → `entity={kind:'property'}`
- `app/(dashboard)/appraisals/[id]/page.tsx` → `entity={kind:'appraisal'}`
- `app/(dashboard)/tasks/page.tsx` → botón global **"Nueva tarea"** sin entidad + refresco de
  la lista al crear.

**Página Pendientes (`/tasks`):**
- Ampliar `CHANNEL_CONFIG` con `visit/document/other` (icono + label).
- `getTaskLink`: tareas sin entidad → sin flecha de link (ya devuelve `#`; ocultar el botón).

### 4. Garantías de no-ruptura

- Migración aditiva (CHECK expandido) — nada existente deja de validar.
- Cambios de `POST /api/tasks` compatibles: campos nuevos opcionales; los callers actuales
  (modal de pipeline) siguen funcionando idénticos.
- El flujo de Seguimiento del pipeline (task + avance de etapa) NO se refactoriza.
- Autorización de asignación reautorizada server-side.

## Unidades y responsabilidades

| Unidad | Qué hace | Depende de |
|---|---|---|
| migración `channel` CHECK | permite tipos nuevos | — |
| `POST /api/tasks` (ext.) | crea tarea validada + autoriza asignación | `lib/supabase/tasks`, `requireAuth` |
| `GET /api/users/assignable` | lista destinatarios | `requireAuth` |
| `AddTaskDialog` | UI de alta reutilizable | primitivos ui, `/api/tasks`, `/api/users/assignable` |
| integraciones (5) | montan el botón+dialog | `AddTaskDialog` |
| `/tasks` (labels + suelta) | muestra los tipos nuevos y tareas sin entidad | — |

## Testing

- `tsc --noEmit` limpio + `vitest` (excluyendo el `video/` anidado).
- **Agente de QA** que ejerce: crear desde cada superficie (contacto/deal/propiedad/tasación),
  tarea suelta, auto-asignación y asignación a otro (con rol permitido y denegado), aparición
  en Pendientes al vencer, completar/descartar. Reporta pass/fail por caso.
- Al pasar en verde, avisar al usuario para prueba real.

## Fuera de alcance (YAGNI v1)

- Recordatorios por email/WhatsApp de tareas próximas (existe infra de visit-reminders; se
  puede sumar después).
- Recurrencia de tareas.
- Rename de la columna `channel` → `kind`.
- Edición de una tarea existente (v1: crear + completar/descartar).

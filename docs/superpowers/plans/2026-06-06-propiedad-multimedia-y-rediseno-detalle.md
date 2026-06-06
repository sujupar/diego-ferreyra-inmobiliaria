# Multimedia de propiedad + rediseño estilo iOS de la página de detalle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir varias fotos a la vez con portada 1·2·3, subir video (archivo) y recorrido virtual (enlace embebido), y rediseñar la página de detalle de una propiedad captada con secciones plegables estilo iOS — sin romper nada existente.

**Architecture:** Las fotos siguen viviendo en `properties.photos` (TEXT[], el orden es la verdad). Se agrega columna `video_file_url`. Las subidas usan el patrón de URL firmada directo a Storage (igual que documentos legales) vía endpoints nuevos `/media/upload-init`, `/media/commit` y `/media` (PATCH para reordenar/borrar/setear video/recorrido). En el front se agrega una tarjeta "Multimedia" con pestañas (Fotos con dnd-kit + lightbox, Video con `<video>`, Recorrido con `<iframe>`), la documentación legal se envuelve en un Collapsible maestro con resumen de estado, y la página se reordena con secciones plegables.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, TypeScript, Supabase JS (service role en routes), shadcn/ui sobre `radix-ui` (Collapsible/Tabs), `@dnd-kit/*` para drag-and-drop, sonner para toasts, Vitest + happy-dom para unit tests de helpers puros.

**Convención de commits:** el autor DEBE ser `Sujupar <redstyle50@gmail.com>` o Netlify falla. Todos los `git commit` usan `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit ...`.

---

## Estructura de archivos

**Nuevos:**
- `lib/properties/media.ts` — constantes (extensiones/límites) + `storagePathFromPublicUrl()`. Pura, testeable.
- `lib/properties/media.test.ts` — tests de `storagePathFromPublicUrl`.
- `types/legal-docs.types.test.ts` — tests de `summarizeLegalDocs`.
- `supabase/migrations/20260606000001_property_video_file_url.sql` — columna `video_file_url`.
- `components/ui/collapsible.tsx` — primitivo shadcn (Collapsible).
- `components/ui/tabs.tsx` — primitivo shadcn (Tabs).
- `components/properties/PhotoGallery.tsx` — galería multi-foto, dnd, portada, borrar, lightbox.
- `components/properties/PropertyMediaCard.tsx` — tarjeta Multimedia con pestañas.
- `app/api/properties/[id]/media/upload-init/route.ts` — URLs firmadas.
- `app/api/properties/[id]/media/commit/route.ts` — commit fotos/video.
- `app/api/properties/[id]/media/route.ts` — PATCH reordenar/borrar/video/recorrido.

**Modificados:**
- `types/legal-docs.types.ts` — agrega `summarizeLegalDocs()`.
- `types/database.types.ts` — agrega `video_file_url` a Row/Insert/Update de properties.
- `lib/supabase/properties.ts` — ensancha tipos de `updateProperty`/`PropertyInput`.
- `components/properties/LegalDocsChecklist.tsx` — envuelve todo en Collapsible maestro con resumen.
- `app/(dashboard)/properties/[id]/page.tsx` — reordena la página, monta `PropertyMediaCard`, agrega `CollapsibleSection`, elimina la subida de foto vieja.

---

## Task 1: Dependencia dnd-kit + helpers de media (TDD)

**Files:**
- Modify: `package.json` (vía npm install)
- Create: `lib/properties/media.ts`
- Test: `lib/properties/media.test.ts`

- [ ] **Step 1: Instalar dnd-kit**

Run:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```
Expected: agrega las 3 dependencias a `package.json` sin errores de peer deps.

- [ ] **Step 2: Escribir el test que falla**

Create `lib/properties/media.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { storagePathFromPublicUrl, PHOTO_EXTS, VIDEO_EXTS, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from './media'

describe('storagePathFromPublicUrl', () => {
  it('extrae el path dentro del bucket property-files', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/property-files/properties/p1/photos/uuid-1.jpg'
    expect(storagePathFromPublicUrl(url)).toBe('properties/p1/photos/uuid-1.jpg')
  })
  it('decodifica caracteres escapados', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/property-files/properties/p1/video/a%20b.mp4'
    expect(storagePathFromPublicUrl(url)).toBe('properties/p1/video/a b.mp4')
  })
  it('devuelve null si no es una URL del bucket', () => {
    expect(storagePathFromPublicUrl('https://youtu.be/abc')).toBeNull()
    expect(storagePathFromPublicUrl('')).toBeNull()
  })
})

describe('constantes de media', () => {
  it('definen extensiones y límites esperados', () => {
    expect(PHOTO_EXTS).toContain('jpg')
    expect(VIDEO_EXTS).toContain('mp4')
    expect(MAX_PHOTO_BYTES).toBe(15 * 1024 * 1024)
    expect(MAX_VIDEO_BYTES).toBe(200 * 1024 * 1024)
  })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npm run test -- lib/properties/media.test.ts`
Expected: FAIL — `Failed to resolve import './media'` (el archivo no existe).

- [ ] **Step 4: Implementar el helper**

Create `lib/properties/media.ts`:
```ts
// Helpers puros + constantes para la multimedia de propiedades.
// Mantener sin dependencias de runtime para que sea testeable y usable
// tanto en el cliente como en las API routes.

export const PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const
export const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'm4v'] as const
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024 // 15 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200 MB

/**
 * Dada una URL pública de Supabase Storage del bucket `property-files`,
 * devuelve el path del objeto dentro del bucket (para borrarlo con
 * `bucket.remove([path])`). Devuelve null si la URL no pertenece al bucket.
 */
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/property-files/'
  const i = url.indexOf(marker)
  if (i === -1) return null
  const path = url.slice(i + marker.length)
  return path ? decodeURIComponent(path) : null
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npm run test -- lib/properties/media.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/properties/media.ts lib/properties/media.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(media): helpers de media + dependencia dnd-kit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `summarizeLegalDocs` para el encabezado plegado (TDD)

**Files:**
- Modify: `types/legal-docs.types.ts`
- Test: `types/legal-docs.types.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `types/legal-docs.types.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { summarizeLegalDocs } from './legal-docs.types'
import type { LegalDocsState } from './legal-docs.types'

const keys = ['a', 'b', 'c']

describe('summarizeLegalDocs', () => {
  it('todo aprobado => tone ok', () => {
    const docs: LegalDocsState = { a: { status: 'approved' }, b: { status: 'approved' }, c: { status: 'approved' } }
    const s = summarizeLegalDocs(docs, keys)
    expect(s.tone).toBe('ok')
    expect(s.label).toBe('3/3 aprobados')
  })
  it('algún rechazado => tone bad y prioriza revisar', () => {
    const docs: LegalDocsState = { a: { status: 'approved' }, b: { status: 'rejected' }, c: { status: 'pending' } }
    const s = summarizeLegalDocs(docs, keys)
    expect(s.tone).toBe('bad')
    expect(s.label).toBe('1 rechazado · revisar')
  })
  it('faltantes o pendientes sin rechazos => tone warn', () => {
    const docs: LegalDocsState = { a: { status: 'approved' } }
    const s = summarizeLegalDocs(docs, keys)
    expect(s.tone).toBe('warn')
    expect(s.approved).toBe(1)
    expect(s.missing).toBe(2)
    expect(s.label).toBe('1/3 aprobados')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- types/legal-docs.types.test.ts`
Expected: FAIL — `summarizeLegalDocs is not a function` / import no resuelto.

- [ ] **Step 3: Implementar `summarizeLegalDocs`**

En `types/legal-docs.types.ts`, agregar al final del archivo (después de las exports existentes):
```ts
export type LegalSummaryTone = 'ok' | 'warn' | 'bad'

export interface LegalDocsSummary {
  approved: number
  pending: number
  rejected: number
  missing: number
  total: number
  tone: LegalSummaryTone
  label: string
}

/**
 * Resume el estado de los documentos APLICABLES para mostrarlo en el
 * encabezado plegado de la sección legal. `applicableKeys` son las keys
 * que devuelve getApplicableDocs() para esta propiedad.
 */
export function summarizeLegalDocs(docs: LegalDocsState, applicableKeys: string[]): LegalDocsSummary {
  let approved = 0, pending = 0, rejected = 0, missing = 0
  for (const key of applicableKeys) {
    const status = docs[key]?.status ?? 'missing'
    if (status === 'approved') approved++
    else if (status === 'pending') pending++
    else if (status === 'rejected') rejected++
    else missing++
  }
  const total = applicableKeys.length
  let tone: LegalSummaryTone
  let label: string
  if (rejected > 0) {
    tone = 'bad'
    label = `${rejected} rechazado${rejected !== 1 ? 's' : ''} · revisar`
  } else if (pending + missing > 0) {
    tone = 'warn'
    label = `${approved}/${total} aprobados`
  } else {
    tone = 'ok'
    label = `${total}/${total} aprobados`
  }
  return { approved, pending, rejected, missing, total, tone, label }
}
```

> Nota: si `LegalDocsState` no está exportado como tipo en este archivo, agregar `export` a su declaración. El test lo importa.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- types/legal-docs.types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add types/legal-docs.types.ts types/legal-docs.types.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(legal): summarizeLegalDocs para resumen plegable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migración `video_file_url` + tipos

**Files:**
- Create: `supabase/migrations/20260606000001_property_video_file_url.sql`
- Modify: `types/database.types.ts` (líneas ~480, ~526, ~572 — después de cada `tour_3d_url`)
- Modify: `lib/supabase/properties.ts`

- [ ] **Step 1: Crear la migración**

Create `supabase/migrations/20260606000001_property_video_file_url.sql`:
```sql
-- Columna para el archivo de VIDEO subido a Storage de la propiedad.
-- `video_url` se mantiene para enlaces externos que consumen los portales
-- (esperan algo tipo YouTube). `video_file_url` guarda la URL pública del
-- archivo subido a Storage, que se reproduce embebido con <video>.
alter table public.properties
  add column if not exists video_file_url text;
```

- [ ] **Step 2: Agregar `video_file_url` a los 3 bloques de `types/database.types.ts`**

En el bloque Row (donde dice `tour_3d_url: string | null`):
```ts
                    tour_3d_url: string | null
                    video_file_url: string | null
```
En el bloque Insert (`tour_3d_url?: string | null`):
```ts
                    tour_3d_url?: string | null
                    video_file_url?: string | null
```
En el bloque Update (`tour_3d_url?: string | null`):
```ts
                    tour_3d_url?: string | null
                    video_file_url?: string | null
```

- [ ] **Step 3: Ensanchar tipos en `lib/supabase/properties.ts`**

Modificar la firma de `updateProperty` (línea ~92) para aceptar los campos de media:
```ts
export async function updateProperty(id: string, updates: Partial<PropertyInput> & { status?: string; documents?: any; photos?: string[]; video_url?: string | null; tour_3d_url?: string | null; video_file_url?: string | null }) {
```
Y agregar al `interface PropertyInput` (después de `photos?: string[]`):
```ts
  photos?: string[]
  video_url?: string | null
  tour_3d_url?: string | null
  video_file_url?: string | null
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `video_file_url`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260606000001_property_video_file_url.sql types/database.types.ts lib/supabase/properties.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(db): columna video_file_url + tipos de media en properties

NOTA: correr el ALTER TABLE en el Dashboard SQL Editor (Supabase CLI no conecta).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Acción manual del usuario:** correr el contenido de la migración en el SQL Editor del Dashboard de Supabase y confirmar con `select video_file_url from properties limit 1;`.

---

## Task 4: Primitivos shadcn Collapsible + Tabs

**Files:**
- Create: `components/ui/collapsible.tsx`
- Create: `components/ui/tabs.tsx`

- [ ] **Step 1: Verificar que `radix-ui` exporta los primitivos**

Run:
```bash
node -e "const {Collapsible,Tabs}=require('radix-ui'); console.log(!!Collapsible.Root,!!Collapsible.Trigger,!!Collapsible.Content,!!Tabs.Root,!!Tabs.List,!!Tabs.Trigger,!!Tabs.Content)"
```
Expected: `true true true true true true true`

- [ ] **Step 2: Crear `components/ui/collapsible.tsx`**

```tsx
"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

function Collapsible(props: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger(props: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
}

function CollapsibleContent(props: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return <CollapsiblePrimitive.Content data-slot="collapsible-content" {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
```

- [ ] **Step 3: Crear `components/ui/tabs.tsx`**

```tsx
"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-2", className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-1", className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en los dos archivos nuevos.

- [ ] **Step 5: Commit**

```bash
git add components/ui/collapsible.tsx components/ui/tabs.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(ui): primitivos Collapsible y Tabs (shadcn sobre radix-ui)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: API `POST /media/upload-init` (URLs firmadas)

**Files:**
- Create: `app/api/properties/[id]/media/upload-init/route.ts`

- [ ] **Step 1: Implementar el route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { PHOTO_EXTS, VIDEO_EXTS, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from '@/lib/properties/media'

function getStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
}

interface FileMeta { fileName?: string; fileSize?: number; contentType?: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const kind = body.kind as 'photo' | 'video'
    const files: FileMeta[] = Array.isArray(body.files) ? body.files : []

    if (kind !== 'photo' && kind !== 'video') {
      return NextResponse.json({ error: 'kind inválido (photo|video)' }, { status: 400 })
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'No se enviaron archivos' }, { status: 400 })
    }

    const allowed = kind === 'photo' ? (PHOTO_EXTS as readonly string[]) : (VIDEO_EXTS as readonly string[])
    const maxBytes = kind === 'photo' ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES
    const folder = kind === 'photo' ? 'photos' : 'video'
    const bucket = getStorage().from('property-files')

    const uploads: Array<{ signedUrl: string; token: string; path: string; publicUrl: string; contentType: string }> = []
    for (const f of files) {
      const ext = (f.fileName?.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!ext || !allowed.includes(ext)) {
        return NextResponse.json({ error: `Formato no permitido (.${ext || '?'}). Permitidos: ${allowed.join(', ')}` }, { status: 400 })
      }
      if (typeof f.fileSize !== 'number' || f.fileSize <= 0) {
        return NextResponse.json({ error: `Archivo inválido o vacío: ${f.fileName}` }, { status: 400 })
      }
      if (f.fileSize > maxBytes) {
        return NextResponse.json({ error: `"${f.fileName}" supera el máximo de ${(maxBytes / 1024 / 1024).toFixed(0)} MB.` }, { status: 413 })
      }
      const path = `properties/${id}/${folder}/${randomUUID()}.${ext}`
      const { data, error } = await bucket.createSignedUploadUrl(path)
      if (error || !data) {
        return NextResponse.json({ error: error?.message || 'No se pudo generar URL de subida' }, { status: 500 })
      }
      const { data: { publicUrl } } = bucket.getPublicUrl(path)
      uploads.push({ signedUrl: data.signedUrl, token: data.token, path: data.path, publicUrl, contentType: f.contentType || 'application/octet-stream' })
    }

    return NextResponse.json({ uploads })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. (Confirma que `requireAuth()` devuelve `{ profile: { role } }`; ya se usa así en `app/api/properties/[id]/route.ts:23`.)

- [ ] **Step 3: Commit**

```bash
git add "app/api/properties/[id]/media/upload-init/route.ts"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(api): media/upload-init con URLs firmadas (fotos y video)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: API `POST /media/commit`

**Files:**
- Create: `app/api/properties/[id]/media/commit/route.ts`

- [ ] **Step 1: Implementar el route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { getProperty, updateProperty, checkAndAdvanceProperty } from '@/lib/supabase/properties'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    if (body.kind === 'photo') {
      const urls: string[] = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === 'string') : []
      if (urls.length === 0) {
        return NextResponse.json({ error: 'No se enviaron URLs' }, { status: 400 })
      }
      const prop = await getProperty(id)
      const existing = Array.isArray(prop.photos) ? prop.photos : []
      await updateProperty(id, { photos: [...existing, ...urls] })
      // Auto-avance UNA sola vez tras el lote (no por archivo).
      try { await checkAndAdvanceProperty(id) } catch (e) { console.error('[media/commit] auto-advance:', e) }
      return NextResponse.json({ success: true })
    }

    if (body.kind === 'video') {
      if (typeof body.url !== 'string' || !body.url) {
        return NextResponse.json({ error: 'url de video requerida' }, { status: 400 })
      }
      await updateProperty(id, { video_file_url: body.url })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'kind inválido (photo|video)' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/api/properties/[id]/media/commit/route.ts"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(api): media/commit (append fotos + set video, auto-avance único)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: API `PATCH /media` (reordenar / borrar / video / recorrido)

**Files:**
- Create: `app/api/properties/[id]/media/route.ts`

- [ ] **Step 1: Implementar el route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { createClient } from '@supabase/supabase-js'
import { getProperty, updateProperty } from '@/lib/supabase/properties'
import { storagePathFromPublicUrl } from '@/lib/properties/media'

function getStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
}

async function removeFromStorage(publicUrl: string | null | undefined) {
  if (!publicUrl) return
  const path = storagePathFromPublicUrl(publicUrl)
  if (!path) return
  try { await getStorage().from('property-files').remove([path]) }
  catch (e) { console.error('[media PATCH] no se pudo borrar de Storage:', e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    // Reordenar / elegir portada: setea el array completo (un solo write).
    if (Array.isArray(body.photos)) {
      const photos = body.photos.filter((u: unknown) => typeof u === 'string')
      await updateProperty(id, { photos })
      return NextResponse.json({ success: true })
    }

    // Borrar una foto: saca del array + borra de Storage.
    if (typeof body.deletePhoto === 'string') {
      const prop = await getProperty(id)
      const existing = Array.isArray(prop.photos) ? prop.photos : []
      const photos = existing.filter((u: string) => u !== body.deletePhoto)
      await updateProperty(id, { photos })
      await removeFromStorage(body.deletePhoto)
      return NextResponse.json({ success: true })
    }

    // Setear o limpiar el video subido.
    if ('video_file_url' in body) {
      const val: string | null = typeof body.video_file_url === 'string' && body.video_file_url ? body.video_file_url : null
      if (val === null) {
        const prop = await getProperty(id)
        await removeFromStorage(prop.video_file_url)
      }
      await updateProperty(id, { video_file_url: val })
      return NextResponse.json({ success: true })
    }

    // Setear o limpiar el recorrido virtual (enlace).
    if ('tour_3d_url' in body) {
      const val: string | null = typeof body.tour_3d_url === 'string' && body.tour_3d_url.trim() ? body.tour_3d_url.trim() : null
      await updateProperty(id, { tour_3d_url: val })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Operación no reconocida' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/api/properties/[id]/media/route.ts"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(api): PATCH media (reordenar/borrar/video/recorrido)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Componente `PhotoGallery` (multi-upload, dnd, portada, borrar, lightbox)

**Files:**
- Create: `components/properties/PhotoGallery.tsx`

- [ ] **Step 1: Implementar el componente**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, X, GripVertical } from 'lucide-react'

interface Props {
  propertyId: string
  photos: string[]
  onChanged: () => void
}

function SortablePhoto({ url, index, onDelete, onOpen }: { url: string; index: number; onDelete: (u: string) => void; onOpen: (i: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const isCover = index < 3
  return (
    <div ref={setNodeRef} style={style} className={`relative rounded-xl overflow-hidden aspect-[4/3] bg-muted group ${isCover ? 'ring-2 ring-[color:var(--brand)]' : ''}`}>
      <img src={url} alt={`Foto ${index + 1}`} className="w-full h-full object-cover cursor-zoom-in" onClick={() => onOpen(index)} />
      {isCover && (
        <span className="absolute top-1.5 left-1.5 bg-[color:var(--brand)] text-white text-[11px] font-bold rounded-md px-2 py-0.5 shadow">
          Portada {index + 1}
        </span>
      )}
      <button type="button" onClick={() => onDelete(url)} aria-label="Eliminar foto"
        className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
        <X className="h-3.5 w-3.5" />
      </button>
      <button type="button" {...attributes} {...listeners} aria-label="Arrastrar para reordenar"
        className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/40 text-white flex items-center justify-center cursor-grab touch-none">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function PhotoGallery({ propertyId, photos, onChanged }: Props) {
  const [items, setItems] = useState<string[]>(photos)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => { setItems(photos) }, [photos])

  async function persistOrder(next: string[]) {
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: next }),
      })
      if (!res.ok) throw new Error()
      toast.success('Guardado')
    } catch {
      toast.error('No se pudo guardar el orden')
      onChanged()
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = items.indexOf(String(active.id))
    const to = items.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(items, from, to)
    setItems(next)
    persistOrder(next)
  }

  async function uploadFiles(fileList: FileList) {
    const list = Array.from(fileList)
    if (list.length === 0) return
    setUploading(true); setProgress(0)
    const t = toast.loading(`Subiendo ${list.length} foto(s)…`)
    try {
      const initRes = await fetch(`/api/properties/${propertyId}/media/upload-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'photo', files: list.map(f => ({ fileName: f.name, fileSize: f.size, contentType: f.type })) }),
      })
      const initData = await initRes.json().catch(() => ({}))
      if (!initRes.ok) { toast.error(initData?.error || 'No se pudo iniciar la subida', { id: t }); return }
      const uploads = initData.uploads as Array<{ signedUrl: string; token: string; path: string; publicUrl: string }>
      const okUrls: string[] = []
      let done = 0
      await Promise.all(uploads.map((u, i) => new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', u.signedUrl, true)
        xhr.setRequestHeader('Content-Type', list[i].type || 'application/octet-stream')
        xhr.setRequestHeader('x-upsert', 'true')
        if (u.token) xhr.setRequestHeader('Authorization', `Bearer ${u.token}`)
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) okUrls.push(u.publicUrl)
          done++; setProgress(Math.round((done / uploads.length) * 100))
          toast.loading(`Subiendo ${done}/${uploads.length}…`, { id: t })
          resolve()
        }
        xhr.onerror = () => { done++; resolve() }
        xhr.send(list[i])
      })))
      if (okUrls.length === 0) { toast.error('No se pudo subir ninguna foto', { id: t }); return }
      const commitRes = await fetch(`/api/properties/${propertyId}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'photo', urls: okUrls }),
      })
      if (!commitRes.ok) { const d = await commitRes.json().catch(() => ({})); toast.error(d?.error || 'No se pudieron registrar las fotos', { id: t }); return }
      const failed = uploads.length - okUrls.length
      toast.success(failed > 0 ? `${okUrls.length} subidas · ${failed} fallaron` : `${okUrls.length} foto(s) subida(s)`, { id: t })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir', { id: t })
    } finally {
      setUploading(false); setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function deletePhoto(url: string) {
    if (!confirm('¿Eliminar esta foto?')) return
    const next = items.filter(u => u !== url)
    setItems(next)
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletePhoto: url }),
      })
      if (!res.ok) throw new Error()
      toast.success('Foto eliminada')
    } catch {
      toast.error('No se pudo eliminar')
      onChanged()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Las 3 primeras son la portada. Arrastrá para reordenar.</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{progress > 0 ? `${progress}%` : '…'}</> : <><Upload className="h-4 w-4 mr-1" />Subir fotos</>}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay fotos subidas.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {items.map((url, i) => (
                <SortablePhoto key={url} url={url} index={i} onDelete={deletePhoto} onOpen={setLightbox} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {lightbox !== null && items[lightbox] && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)} aria-label="Cerrar"><X className="h-7 w-7" /></button>
          <button className="absolute left-4 text-white text-4xl px-3" aria-label="Anterior"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + items.length) % items.length) }}>‹</button>
          <img src={items[lightbox]} alt="" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          <button className="absolute right-4 text-white text-4xl px-3" aria-label="Siguiente"
            onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % items.length) }}>›</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (dnd-kit ya instalado en Task 1).

- [ ] **Step 3: Commit**

```bash
git add components/properties/PhotoGallery.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): PhotoGallery con multi-upload, portada 1-3, dnd y lightbox

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Componente `PropertyMediaCard` (pestañas Fotos/Video/Recorrido)

**Files:**
- Create: `components/properties/PropertyMediaCard.tsx`

- [ ] **Step 1: Implementar el componente**

```tsx
'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Film, Globe, Loader2, Upload, Trash2, Check, ExternalLink } from 'lucide-react'
import { PhotoGallery } from './PhotoGallery'

interface Props {
  propertyId: string
  photos: string[]
  videoFileUrl: string | null
  tourUrl: string | null
  onChanged: () => void
}

export function PropertyMediaCard({ propertyId, photos, videoFileUrl, tourUrl, onChanged }: Props) {
  const videoInput = useRef<HTMLInputElement>(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [tourValue, setTourValue] = useState(tourUrl || '')
  const [savingTour, setSavingTour] = useState(false)

  async function uploadVideo(file: File) {
    setVideoUploading(true); setVideoProgress(0)
    const t = toast.loading(`Subiendo video (${(file.size / 1024 / 1024).toFixed(1)} MB)…`)
    try {
      const initRes = await fetch(`/api/properties/${propertyId}/media/upload-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'video', files: [{ fileName: file.name, fileSize: file.size, contentType: file.type }] }),
      })
      const initData = await initRes.json().catch(() => ({}))
      if (!initRes.ok) { toast.error(initData?.error || 'No se pudo iniciar la subida', { id: t }); return }
      const u = initData.uploads[0] as { signedUrl: string; token: string; publicUrl: string }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', u.signedUrl, true)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.setRequestHeader('x-upsert', 'true')
        if (u.token) xhr.setRequestHeader('Authorization', `Bearer ${u.token}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 100); setVideoProgress(p); toast.loading(`Subiendo video — ${p}%`, { id: t }) }
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Error de red'))
        xhr.send(file)
      })
      const commitRes = await fetch(`/api/properties/${propertyId}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'video', url: u.publicUrl }),
      })
      if (!commitRes.ok) { const d = await commitRes.json().catch(() => ({})); toast.error(d?.error || 'No se pudo registrar el video', { id: t }); return }
      toast.success('Video subido', { id: t })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir video', { id: t })
    } finally {
      setVideoUploading(false); setVideoProgress(0)
      if (videoInput.current) videoInput.current.value = ''
    }
  }

  async function removeVideo() {
    if (!confirm('¿Quitar el video?')) return
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_file_url: null }),
      })
      if (!res.ok) throw new Error()
      toast.success('Video quitado'); onChanged()
    } catch { toast.error('No se pudo quitar el video') }
  }

  async function saveTour() {
    setSavingTour(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tour_3d_url: tourValue.trim() || null }),
      })
      if (!res.ok) throw new Error()
      toast.success(tourValue.trim() ? 'Recorrido guardado' : 'Recorrido quitado'); onChanged()
    } catch { toast.error('No se pudo guardar el recorrido') } finally { setSavingTour(false) }
  }

  const videoBtn = (label: string) => (
    <Button size="sm" variant="outline" onClick={() => videoInput.current?.click()} disabled={videoUploading}>
      {videoUploading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{videoProgress > 0 ? `${videoProgress}%` : '…'}</> : <><Upload className="h-4 w-4 mr-1" />{label}</>}
    </Button>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="display text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          Multimedia
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="fotos">
          <TabsList className="w-full">
            <TabsTrigger value="fotos"><ImageIcon className="h-4 w-4" />Fotos{photos.length > 0 && <span className="tabular-n text-xs">· {photos.length}</span>}</TabsTrigger>
            <TabsTrigger value="video"><Film className="h-4 w-4" />Video{videoFileUrl && <Check className="h-3.5 w-3.5 text-emerald-600" />}</TabsTrigger>
            <TabsTrigger value="recorrido"><Globe className="h-4 w-4" />Recorrido{tourUrl && <Check className="h-3.5 w-3.5 text-emerald-600" />}</TabsTrigger>
          </TabsList>

          <TabsContent value="fotos" className="pt-4">
            <PhotoGallery propertyId={propertyId} photos={photos} onChanged={onChanged} />
          </TabsContent>

          <TabsContent value="video" className="pt-4 space-y-3">
            <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && uploadVideo(e.target.files[0])} />
            {videoFileUrl ? (
              <>
                <video controls preload="metadata" src={videoFileUrl} className="w-full rounded-xl bg-black aspect-video" />
                <div className="flex gap-2">
                  {videoBtn('Reemplazar')}
                  <Button size="sm" variant="outline" onClick={removeVideo}><Trash2 className="h-4 w-4 mr-1" />Quitar</Button>
                </div>
              </>
            ) : (
              <div className="border border-dashed rounded-xl p-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">Subí un video de la propiedad (máx 200 MB).</p>
                {videoBtn('Subir video')}
              </div>
            )}
          </TabsContent>

          <TabsContent value="recorrido" className="pt-4 space-y-3">
            <div className="flex gap-2">
              <input
                value={tourValue}
                onChange={e => setTourValue(e.target.value)}
                placeholder="Pegá el enlace (Matterport, Kuula, 360°…)"
                className="flex-1 rounded-md border px-3 py-2 text-sm"
              />
              <Button size="sm" onClick={saveTour} disabled={savingTour}>
                {savingTour ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
            {tourUrl && (
              <div className="space-y-2">
                <div className="rounded-xl overflow-hidden border aspect-video bg-muted">
                  <iframe src={tourUrl} className="w-full h-full" allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
                <a href={tourUrl} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />Abrir en pestaña nueva
                </a>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/PropertyMediaCard.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): PropertyMediaCard con pestañas Fotos/Video/Recorrido

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Envolver `LegalDocsChecklist` en Collapsible maestro

**Files:**
- Modify: `components/properties/LegalDocsChecklist.tsx`

- [ ] **Step 1: Agregar imports**

En la línea de imports de lucide (línea 16), agregar `ChevronDown`:
```ts
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle, Clock, Loader2, Scale, FileCheck2, CalendarClock, FilePlus2, ChevronDown } from 'lucide-react'
```
Debajo de la import de Dialog (después de la línea 15), agregar:
```ts
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
```
En la import de tipos (línea 18), agregar `summarizeLegalDocs`:
```ts
import { LEGAL_DOCS_CATALOG, getApplicableDocs, summarizeLegalDocs } from '@/types/legal-docs.types'
```

- [ ] **Step 2: Calcular el resumen**

Después de la línea 58 (`const optional = applicable.filter(...)`), agregar:
```ts
  const summary = summarizeLegalDocs(docs, applicable.map(d => d.key))
  const summaryPill =
    summary.tone === 'bad' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
    summary.tone === 'warn' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
```

- [ ] **Step 3: Envolver el render en el Collapsible maestro**

Reemplazar el bloque actual (líneas 276-317), que es:
```tsx
  return (
    <>
      <div className="space-y-6">
        {/* Flags condicionales (solo asesor puede cambiar) */}
        ... (todo el contenido) ...

        {optional.length > 0 && sectionCard(FilePlus2, 'Documentos Opcionales', 'Opcionales', optional)}
      </div>
```
por:
```tsx
  return (
    <>
      <Collapsible defaultOpen={summary.tone !== 'ok'}>
        <Card className="rounded-xl">
          <CollapsibleTrigger asChild>
            <button className="group w-full flex items-center gap-3 px-6 py-4 text-left">
              <span className="h-9 w-9 rounded-full bg-[color:var(--brand-soft)]/40 flex items-center justify-center shrink-0">
                <Scale className="h-5 w-5 text-[color:var(--brand)]" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="eyebrow block">Documentación</span>
                <span className="display text-base">Documentación Legal</span>
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${summaryPill}`}>{summary.label}</span>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-6 pb-6 space-y-6">
              {/* Flags condicionales (solo asesor puede cambiar) */}
              ... (mismo contenido que antes: el bloque de flags + los 3 sectionCard) ...

              {optional.length > 0 && sectionCard(FilePlus2, 'Documentos Opcionales', 'Opcionales', optional)}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
```
Es decir: el `<div className="space-y-6">` exterior pasa a estar DENTRO de `CollapsibleContent` como `<div className="px-6 pb-6 space-y-6">`, y todo lo demás (flags card + sectionCards) queda igual. El `</div>` de cierre original (línea 317) se reemplaza por el cierre `</div></CollapsibleContent></Card></Collapsible>`. El `<Dialog>` de rechazo (líneas 319-352) y el cierre `</>` quedan intactos.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/properties/LegalDocsChecklist.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(legal): documentación legal en desplegable maestro con resumen de estado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Reordenar la página de detalle + montar Multimedia + plegables

**Files:**
- Modify: `app/(dashboard)/properties/[id]/page.tsx`

- [ ] **Step 1: Ajustar imports**

Reemplazar la import de react (línea 3):
```tsx
import { useState, useEffect, useRef, type ReactNode } from 'react'
```
Reemplazar la import de lucide (líneas 9-13) por (quita `Upload`, `FileText`, `Image`; agrega `ChevronDown`):
```tsx
import {
  Loader2, CheckCircle, XCircle,
  Send, ArrowLeft, MapPin, Home, Scale, Camera, AlertTriangle,
  Archive, Trash2, RotateCcw, ChevronDown
} from 'lucide-react'
```
Después de la import de `LegalDocsChecklist` (línea 14), agregar:
```tsx
import { PropertyMediaCard } from '@/components/properties/PropertyMediaCard'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
```

- [ ] **Step 2: Agregar campos de media a `PropertyData`**

En la interfaz `PropertyData` (después de `photos: string[]`, línea 54), agregar:
```tsx
  photos: string[]
  video_file_url: string | null
  tour_3d_url: string | null
```

- [ ] **Step 3: Agregar el helper `CollapsibleSection` a nivel de módulo**

Antes de `export default function PropertyDetailPage()` (línea 63), agregar:
```tsx
function CollapsibleSection({ eyebrow, title, defaultOpen = false, children }: { eyebrow: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-t pt-2">
      <CollapsibleTrigger asChild>
        <button className="group w-full flex items-center gap-3 py-2 text-left">
          <span className="flex-1 min-w-0">
            <span className="eyebrow block">{eyebrow}</span>
            <span className="display text-base">{title}</span>
          </span>
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
```

- [ ] **Step 4: Eliminar el código de subida de foto viejo**

Eliminar:
- `const [uploading, setUploading] = useState(false)` (línea 68)
- `const photoRef = useRef<HTMLInputElement>(null)` (línea 70)
- `const docRef = useRef<HTMLInputElement>(null)` (línea 71)
- toda la función `async function handleUpload(...)` (líneas 141-161)

- [ ] **Step 5: Reemplazar el bloque `return (...)`**

Reemplazar todo el JSX retornado (desde `return (` en línea 278 hasta el `)` final antes del cierre de la función, línea 672) por esta estructura. Los bloques marcados con `{/* === SIN CAMBIOS: ... */}` se copian VERBATIM desde su ubicación actual indicada:

```tsx
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* === SIN CAMBIOS: back button (actual líneas 280-284) === */}
      {/* === SIN CAMBIOS: Header (actual líneas 286-297) === */}
      {/* === SIN CAMBIOS: Banner GHL (actual líneas 299-336) === */}
      {/* === SIN CAMBIOS: Dual-track Progress / Resumen de captación (actual líneas 338-389) === */}

      {/* === ACCIÓN PRINCIPAL + ESTADO (movido arriba) === */}
      {/* SIN CAMBIOS internos, copiar verbatim estos 6 bloques en este orden: */}
      {/*   1. Legal Review Result no-abogado (actual 505-515) */}
      {/*   2. Asesor enviar a revisión (actual 520-525) */}
      {/*   3. Asesor esperando revisión (actual 528-538) */}
      {/*   4. Abogado review action card (actual 541-571) */}
      {/*   5. Abogado ya revisó (actual 574-584) */}
      {/*   6. Recordatorio fotos faltantes (actual 587-597) */}

      {/* === MULTIMEDIA (reemplaza la vieja tarjeta de Fotos) === */}
      {!isAbogado && (
        <PropertyMediaCard
          propertyId={property.id}
          photos={photos}
          videoFileUrl={property.video_file_url ?? null}
          tourUrl={property.tour_3d_url ?? null}
          onChanged={fetchProperty}
        />
      )}

      {/* === DOCUMENTACIÓN LEGAL (ahora auto-plegable) === */}
      <LegalDocsChecklist
        propertyId={property.id}
        propertyType={property.property_type || ''}
        docs={legalDocsData?.docs || {}}
        flags={legalDocsData?.flags || { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }}
        isAbogado={isAbogado}
        onUpdated={fetchLegalDocs}
      />

      {/* === DATOS (plegable) === */}
      <CollapsibleSection eyebrow="Detalle" title="Datos de la propiedad">
        {/* SIN CAMBIOS: el grid de Datos de la Propiedad + Datos Comerciales (actual líneas 421-463), copiar verbatim aquí dentro */}
      </CollapsibleSection>

      {/* === HISTORIAL (plegable, plegado) === */}
      <CollapsibleSection eyebrow="Seguimiento" title="Historial">
        <div className="space-y-6">
          <FlowHistoryCard data={flowHistory} />
          {/* SIN CAMBIOS: el bloque de Feedback de visitas (actual líneas 395-418), copiar verbatim aquí */}
          <LegalReviewHistory propertyId={property.id} />
        </div>
      </CollapsibleSection>

      {/* === SIN CAMBIOS: Sección Marketing (actual líneas 602-619) === */}
      {/* === SIN CAMBIOS: Acciones de archivo (actual líneas 621-670) === */}
    </div>
  )
```

> Importante: al copiar los bloques verbatim, mantené exactamente sus condicionales (`{!isAbogado && ...}`, `{feedback.length > 0 && ...}`, etc.) y su JSX interno. Lo único que cambia es el ORDEN y el wrapping en `CollapsibleSection`. No se elimina ninguna funcionalidad.

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: typecheck sin errores; build de Next completa OK.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/properties/[id]/page.tsx"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): rediseño plegable de la página de detalle + Multimedia

Jerarquía nueva (resumen+acción arriba, historiales plegados abajo),
monta PropertyMediaCard, elimina la subida de foto único.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Verificación final, review y CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Tests + build verdes**

Run: `npm run test && npm run build`
Expected: todos los tests PASS; build OK.

- [ ] **Step 2: Verificación manual (con la migración ya aplicada en el Dashboard)**

Levantar la app (`npm run dev`) y, en una propiedad captada real, confirmar:
- [ ] Subir 5+ fotos a la vez en una sola selección → aparecen todas.
- [ ] Las 3 primeras se marcan "Portada 1/2/3"; arrastrar reordena y aparece toast "Guardado"; recargar mantiene el orden.
- [ ] `photos[0]` (portada) coincide con la miniatura del listado `/properties`.
- [ ] Borrar una foto → desaparece de la grilla y del bucket.
- [ ] Lightbox abre al click, navega con ‹ ›, cierra con la X / click afuera.
- [ ] Subir un MP4 → se reproduce embebido; Reemplazar y Quitar funcionan.
- [ ] Pegar un enlace de recorrido (Matterport/Kuula/360) → se ve embebido; "Abrir en pestaña nueva" funciona; Guardar vacío lo quita.
- [ ] Documentación Legal: encabezado plegado muestra el resumen correcto en los 3 escenarios (todo ok / pendiente / rechazado); abrir/cerrar funciona; subir/aprobar/rechazar siguen operando.
- [ ] Cuando legal está aprobada y entra la primera foto, el estado pasa a "Captación Completa" (auto-avance) una sola vez.
- [ ] Como rol `abogado`: NO ve Multimedia ni Archivar; ve la documentación legal (plegable) y puede aprobar/rechazar.

- [ ] **Step 3: Ejecutar /review**

Ejecutar el comando `/code-review` (o `/review`) sobre el diff de la rama y resolver los hallazgos de alta confianza.

- [ ] **Step 4: Actualizar CLAUDE.md**

Agregar a `CLAUDE.md`, en la sección "Operational Gotchas / Lessons Learned", una entrada nueva documentando:
```markdown
### Multimedia de propiedad: fotos (orden=portada), video (archivo) y recorrido (enlace)

- **Modelo:** `properties.photos` (TEXT[]) — el ORDEN del array es la verdad; las 3 primeras son la portada y `photos[0]` es la miniatura en todos lados. `video_url` queda RESERVADO para enlaces de portales; el video subido va en `video_file_url` (Storage, reproducido con `<video>`). `tour_3d_url` guarda el enlace del recorrido (embebido en `<iframe>`).
- **Subida:** SIEMPRE por URL firmada directa a Storage (endpoints `/api/properties/[id]/media/upload-init` + `/media/commit`), NO multipart al server (evita el límite de body de Next.js). Mismo patrón que los documentos legales.
- **Mutaciones de media:** `PATCH /api/properties/[id]/media` (reordenar=array completo, `deletePhoto`, `video_file_url`, `tour_3d_url`). NO usar el `PUT /api/properties/[id]` para media: ese tiene efectos secundarios (crea tarea + dispara email cuando status='pending_review').
- **Auto-avance:** `checkAndAdvanceProperty` se llama UNA sola vez en el commit del lote, nunca por archivo (evita disparos múltiples de la notificación de captación N8A/N8B).
- **UI:** los primitivos `components/ui/collapsible.tsx` y `tabs.tsx` se importan del paquete bundleado `radix-ui` (no `@radix-ui/react-*` standalone). Drag-and-drop con `@dnd-kit/*`.
- **Migración pendiente de aplicar manual:** `20260606000001_property_video_file_url.sql` (Supabase CLI no conecta).
```

- [ ] **Step 5: Commit + push**

```bash
git add CLAUDE.md
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "docs(claude): notas de multimedia de propiedad (orden=portada, video archivo, recorrido)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin main
```
Expected: push OK → Netlify auto-deploya.

---

## Self-Review (cobertura del spec)

- **Subir varias fotos a la vez** → Task 5 (init multi) + Task 6 (commit) + Task 8 (input `multiple`). ✓
- **Elegir las 3 principales en orden** → Task 8 (fila portada = primeras 3, dnd reorder, autosave) + Task 7 (PATCH photos). ✓
- **Borrar + lightbox** → Task 8. ✓
- **Video archivo** → Task 3 (columna) + Task 5/6 (upload/commit video) + Task 9 (`<video>`). ✓
- **Recorrido virtual enlace embebido** → Task 9 (`<iframe>` + fallback) + Task 7 (`tour_3d_url`). ✓
- **Documentación legal desplegable maestro + estado claro** → Task 2 (`summarizeLegalDocs`) + Task 4 (Collapsible) + Task 10. ✓
- **Mejor distribución de toda la página (jerarquía A)** → Task 11. ✓
- **No-regresión (photos[0], portales, legal flow, RLS, auto-avance)** → Tasks 6/7/11 + verificación Task 12. ✓
- **`/review` + actualizar CLAUDE.md** → Task 12. ✓

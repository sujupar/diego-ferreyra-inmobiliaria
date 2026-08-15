-- =============================================================================
-- Central de Contenido — sección /contenido (enlace directo, fuera del menú).
-- 4 tablas: piezas programadas (calendario), banco de ideas, banco de formatos
-- y memoria de correcciones de Diego. IDEMPOTENTE.
-- RLS: solo operaciones (admin/dueno/coordinador). El asesor y el abogado no
-- participan de la producción de contenido de marca.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------- trigger updated_at (propio, no depende de otras migraciones) ----------
create or replace function public.tg_content_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- PIEZAS (el calendario) ----------
create table if not exists public.content_pieces (
  id            uuid primary key default gen_random_uuid(),
  publish_date  date not null,
  slot          text not null default 'a' check (slot in ('a','b')),
  categoria     text not null check (categoria in
                  ('tendencias','secretos','metodo','casos','psicologia','innovacion')),
  subcategoria  text check (subcategoria in ('marketing','ia')),
  titular       text not null,
  enfoque       text,
  formato       text,
  recurso       text,
  guion         text,
  copy          text,
  plataformas   text[] not null default '{tiktok,instagram}',
  estado        text not null default 'propuesto' check (estado in
                  ('propuesto','aprobado','guionizado','revisado','grabado','publicado','descartado')),
  origen        text not null default 'banco',
  refrescar     boolean not null default false,
  notas         text,
  -- resultados por plataforma: {"tiktok":{"views":0,"likes":0,...},"instagram":{...}}
  resultados    jsonb not null default '{}'::jsonb,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_content_pieces_date on public.content_pieces(publish_date);
create index if not exists idx_content_pieces_estado on public.content_pieces(estado);

-- ---------- BANCO DE IDEAS ----------
create table if not exists public.content_ideas (
  id            uuid primary key default gen_random_uuid(),
  categoria     text not null check (categoria in
                  ('tendencias','secretos','metodo','casos','psicologia','innovacion')),
  subcategoria  text check (subcategoria in ('marketing','ia')),
  titular       text not null,
  enfoque       text,
  formato       text,
  recurso       text,
  prioridad     text not null default 'media' check (prioridad in ('alta','media')),
  origen        text not null default 'banco',        -- banco | nuevo
  fuente        text,                                  -- cita textual del banco de Diego
  refrescar     boolean not null default false,
  estado        text not null default 'disponible' check (estado in ('disponible','usada','descartada')),
  piece_id      uuid references public.content_pieces(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_content_ideas_cat on public.content_ideas(categoria, estado);

-- ---------- BANCO DE FORMATOS ----------
create table if not exists public.content_formats (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  descripcion      text,
  cuando_usar      text,
  diego_ya_lo_hizo boolean not null default false,
  referencias      jsonb not null default '[]'::jsonb,  -- [{url,nota}]
  created_at       timestamptz not null default now()
);

-- ---------- MEMORIA DE CORRECCIONES ----------
create table if not exists public.content_corrections (
  id            uuid primary key default gen_random_uuid(),
  corrected_at  date not null default current_date,
  que_corrigio  text not null,
  regla         text not null,
  piece_id      uuid references public.content_pieces(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------- triggers ----------
drop trigger if exists trg_content_pieces_touch on public.content_pieces;
create trigger trg_content_pieces_touch before update on public.content_pieces
  for each row execute function public.tg_content_touch();
drop trigger if exists trg_content_ideas_touch on public.content_ideas;
create trigger trg_content_ideas_touch before update on public.content_ideas
  for each row execute function public.tg_content_touch();

-- ---------- RLS ----------
alter table public.content_pieces      enable row level security;
alter table public.content_ideas       enable row level security;
alter table public.content_formats     enable row level security;
alter table public.content_corrections enable row level security;

do $$ begin
  create policy p_content_pieces_ops on public.content_pieces
    for all to authenticated
    using (public.is_operations_user()) with check (public.is_operations_user());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_content_ideas_ops on public.content_ideas
    for all to authenticated
    using (public.is_operations_user()) with check (public.is_operations_user());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_content_formats_ops on public.content_formats
    for all to authenticated
    using (public.is_operations_user()) with check (public.is_operations_user());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_content_corrections_ops on public.content_corrections
    for all to authenticated
    using (public.is_operations_user()) with check (public.is_operations_user());
exception when duplicate_object then null; end $$;

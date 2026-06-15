-- Testimonios de las landings (compartidos por Tasación y Clase VSL).
-- El ORDEN lo da sort_order. video_url/poster_url = URLs públicas del bucket funnel-media.
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta).

create table if not exists public.funnel_testimonials (
  id           uuid primary key default gen_random_uuid(),
  key          text unique not null,            -- 'federico' | 'pablo' | 'claudia'
  client_name  text not null,                   -- 'Federico'
  location     text not null,                   -- 'Propietario en Zona Norte'
  title        text not null,                   -- 'Venta Récord en 25 Días'
  result_badge text,                            -- 'Vendió en 25 días'
  quote        text not null,
  video_url    text not null,
  poster_url   text not null,
  is_vertical  boolean not null default true,
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.funnel_testimonials enable row level security;

-- Lectura pública SOLO de los activos (anon + authenticated). Escritura: solo service-role (bypassa RLS).
drop policy if exists "funnel_testimonials public read" on public.funnel_testimonials;
create policy "funnel_testimonials public read"
  on public.funnel_testimonials for select
  to anon, authenticated
  using (active = true);

insert into public.funnel_testimonials
  (key, client_name, location, title, result_badge, quote, video_url, poster_url, is_vertical, sort_order)
values
  ('federico', 'Federico', 'Propietario en Zona Norte', 'Venta Récord en 25 Días', 'Vendió en 25 días',
   'Vendimos 3 propiedades. La primera en 5 días, la segunda en 15, y la más difícil, en un barrio cerrado de Zona Norte, en solo 25 días. Un reto que para muchos tarda meses.',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/testimonio-federico.mp4',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/poster-federico.jpg',
   true, 1),
  ('pablo', 'Pablo', 'Propietario en CABA', '2 Ventas, 1 Compra y un Sueño Cumplido', '2 ventas + 1 compra',
   'Necesitábamos vender dos propiedades para comprar la de nuestros sueños. El desafío era enorme, pero encontraron la propiedad perfecta y coordinaron todo para que se hiciera realidad.',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/raw/689e7b82960f1a6cf1509715.mp4',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/poster-pablo.jpg',
   true, 2),
  ('claudia', 'Claudia', 'Propietaria en CABA', 'Cero Estrés, 100% Confianza', 'Cero estrés',
   'Vender es un proceso lleno de desconfianza. Buscábamos un apoyo real. El resultado fue una experiencia segura, satisfactoria y sin el estrés que tanto temíamos. Pusieron el corazón.',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/raw/689e7b82f0feb60dbaa365e5.mp4',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/poster-claudia.jpg',
   true, 3)
on conflict (key) do nothing;

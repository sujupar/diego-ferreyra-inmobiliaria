-- Foto del asesor por perfil en el informe de tasación ("foto por agente").
--
-- Cada usuario sube su foto UNA vez (report_photo_url). Cuando ese agente hace
-- la tasación, su foto reemplaza la de Diego en el PDF (portada, divisores y
-- páginas finales). El dueño/admin autoriza qué perfiles pueden aparecer
-- (report_in_pdf). Si el agente no subió foto o no está autorizado, el PDF usa
-- la foto default (Diego).
--
-- Correr manualmente en el SQL Editor del Dashboard (la CLI no conecta).

alter table public.profiles
    add column if not exists report_photo_url text,
    add column if not exists report_in_pdf boolean not null default false;

comment on column public.profiles.report_photo_url is
    'URL (Storage) de la foto del asesor para el informe PDF. NULL = usar la foto default (Diego).';
comment on column public.profiles.report_in_pdf is
    'Si TRUE, este perfil puede aparecer con su foto en el informe. Lo autoriza admin/dueño desde Configuración.';

-- RLS: la LECTURA de profiles ya está cubierta por las políticas existentes
-- (todos los roles autenticados leen profiles para resolver nombres/fotos).
-- ESCRITURA:
--   * report_photo_url  → el propio usuario, vía endpoint server (service role)
--     al subir su foto desde su perfil.
--   * report_in_pdf     → solo admin/dueño, vía endpoint server (service role)
--     desde la pantalla de Configuración.
-- Ambas escrituras pasan por el server con service role (mismo patrón que el
-- resto de acciones administrativas del proyecto), por eso no se agregan
-- políticas RLS de UPDATE nuevas acá.

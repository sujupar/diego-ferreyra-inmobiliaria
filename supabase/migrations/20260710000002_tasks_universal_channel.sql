-- =============================================================================
-- Migración: ampliar tasks.channel para el sistema de tareas universal.
-- Aditiva: los valores existentes (call/email/message) siguen válidos. El modal
-- de Seguimiento del pipeline no cambia. `channel` pasa a representar el "Tipo"
-- de tarea creada por el usuario (rotulado "Tipo" en la UI).
-- Correr en: Supabase Dashboard → SQL Editor (el CLI no conecta en este proyecto).
-- =============================================================================
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_channel_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_channel_check
  CHECK (channel IS NULL OR channel IN ('call','email','message','visit','document','other'));

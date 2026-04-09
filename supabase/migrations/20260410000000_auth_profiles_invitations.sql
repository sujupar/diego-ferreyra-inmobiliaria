-- =============================================================================
-- Migration: Auth Profiles & Invitations
-- Applied in 2 steps via Supabase MCP:
--   1. extend_app_role_enum: Added dueno, coordinador, asesor to app_role enum
--   2. auth_profiles_invitations: Columns, invitations table, RLS, triggers
--
-- The DB uses an existing enum type `app_role` (admin, agent, viewer, dueno, coordinador, asesor)
-- instead of TEXT CHECK constraints.
-- =============================================================================

-- Step 1 (separate transaction required for enum values):
-- ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'dueno';
-- ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'coordinador';
-- ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'asesor';

-- Step 2: Everything else (columns, tables, RLS, triggers)
-- See applied migration in Supabase dashboard for full SQL.

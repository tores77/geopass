-- GeoPass™ — AI Onboarding agent
-- Adds two columns + extends the plan whitelist used by the /onboarding flow.
-- Idempotent: safe to run multiple times.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tipo_negocio TEXT,
  ADD COLUMN IF NOT EXISTS direccion    TEXT;

-- Allow the new "starter" plan tier (used for self-serve onboarding).
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_plan_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_check
  CHECK (plan IN ('starter', 'basic', 'pro', 'enterprise'));

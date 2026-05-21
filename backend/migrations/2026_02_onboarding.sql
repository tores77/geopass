-- GeoPass™ — AI Onboarding agent
-- Adds two columns required by the public /onboarding flow.
-- Idempotent: safe to run multiple times.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tipo_negocio TEXT,
  ADD COLUMN IF NOT EXISTS direccion    TEXT;

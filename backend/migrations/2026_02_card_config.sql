-- GeoPass™ — Card configurator columns
-- Run this in your Supabase SQL Editor BEFORE using the "Mi tarjeta" section.
-- Idempotent: safe to run multiple times.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS nombre_programa       TEXT,
  ADD COLUMN IF NOT EXISTS mensaje_geopush       TEXT,
  ADD COLUMN IF NOT EXISTS radio_geopush         INTEGER DEFAULT 150,
  ADD COLUMN IF NOT EXISTS plantilla_fidelizacion TEXT DEFAULT 'puntos';

-- Backfill sane defaults on existing rows (only where currently NULL).
UPDATE tenants
SET    radio_geopush = 150
WHERE  radio_geopush IS NULL;

UPDATE tenants
SET    plantilla_fidelizacion = 'puntos'
WHERE  plantilla_fidelizacion IS NULL;

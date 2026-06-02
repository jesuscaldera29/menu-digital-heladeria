-- =============================================
-- FIX_DATABASE.sql - EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================

-- 1. Agregar columna 'is_open' a 'cash_closings' (Apertura de Caja)
ALTER TABLE cash_closings
ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;

-- 2. Agregar columna 'pos_only' a 'products' (Productos solo para POS)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS pos_only BOOLEAN DEFAULT false;

-- 3. Agregar columnas de apertura de caja si no existen
ALTER TABLE cash_closings
ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE cash_closings
ADD COLUMN IF NOT EXISTS opening_amount NUMERIC DEFAULT 0;

-- 4. Crear tabla para registro de turnos del personal
CREATE TABLE IF NOT EXISTS staff_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  staff_id UUID,
  staff_name TEXT,
  staff_role TEXT,
  login_at TIMESTAMPTZ DEFAULT now(),
  logout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- IMPORTANTE:
-- Después de ejecutar este código, ve a:
-- Settings (Engranaje) > API > "Reload Schema Cache"
-- De lo contrario, los errores rojos podrían seguir apareciendo.

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

-- 4. Agregar horarios de trabajo a la tabla de personal
ALTER TABLE staff
ADD COLUMN IF NOT EXISTS schedule_in TEXT DEFAULT '';

ALTER TABLE staff
ADD COLUMN IF NOT EXISTS schedule_out TEXT DEFAULT '';

ALTER TABLE staff
ADD COLUMN IF NOT EXISTS work_days TEXT DEFAULT 'Lun-Sáb';

-- 5. Crear tabla de turnos/asistencia (si no existe)
CREATE TABLE IF NOT EXISTS shifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  clock_in TIMESTAMPTZ DEFAULT now(),
  clock_out TIMESTAMPTZ,
  total_hours NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- IMPORTANTE:
-- Después de ejecutar este código, ve a:
-- Settings (Engranaje) > API > "Reload Schema Cache"
-- De lo contrario, los errores rojos podrían seguir apareciendo.

-- 6. Agregar columnas para auditar quién abrió y cerró la caja
ALTER TABLE cash_closings
ADD COLUMN IF NOT EXISTS opened_by VARCHAR(255);

ALTER TABLE cash_closings
ADD COLUMN IF NOT EXISTS closed_by VARCHAR(255);

ALTER TABLE cash_closings
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- ============================================================
-- SCRIPT PARA AGREGAR TARIFA DE DOMICILIO
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Agregar columna delivery_fee a la tabla settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;

-- Agregar columna delivery_fee a la tabla orders para guardar el histórico de la tarifa cobrada
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;

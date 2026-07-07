-- ============================================================
-- AGREGAR LÍMITE DE ACOMPAÑAMIENTOS
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Agregar columna para el límite de selección de acompañamientos en los productos
ALTER TABLE products ADD COLUMN IF NOT EXISTS accompaniments_limit INTEGER DEFAULT NULL;

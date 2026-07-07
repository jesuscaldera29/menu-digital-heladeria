-- ============================================================
-- MIGRACIÓN: Agregar campo pos_only a productos
-- Productos marcados como pos_only = true NO aparecerán 
-- en el menú en línea ni en el kiosko, solo en el POS
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS pos_only BOOLEAN DEFAULT FALSE;

-- ============================================================
-- MIGRACIÓN: Agregar campo opening_amount a cash_closings
-- Para registrar la apertura de caja del día
-- ============================================================

ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS opening_amount NUMERIC DEFAULT 0;
ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT FALSE;

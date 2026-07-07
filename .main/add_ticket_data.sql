-- ============================================================
-- MIGRACIÓN: Agregar campo ticket_data a la tabla settings
-- Esto permite guardar los datos del negocio (NIT, Sede, etc)
-- que saldrán impresos en el ticket de venta.
-- ============================================================

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ticket_data JSONB DEFAULT '{}'::jsonb;

-- Agregar columna de impresoras en la nube a la tabla settings
-- Esto permitirá a cada negocio guardar múltiples impresoras con sus respectivas IPs
ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS printers JSONB DEFAULT '[]'::jsonb;

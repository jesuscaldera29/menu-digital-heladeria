-- Agregar columnas de mesas y url al settings
ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS table_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS menu_url TEXT DEFAULT '';

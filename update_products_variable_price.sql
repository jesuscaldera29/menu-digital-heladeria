-- Agregar columna para productos de precio variable
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_variable_price BOOLEAN DEFAULT FALSE;

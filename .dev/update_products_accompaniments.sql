-- Agregar columna de acompañamientos a la tabla products
ALTER TABLE products
ADD COLUMN IF NOT EXISTS accompaniments TEXT DEFAULT '';

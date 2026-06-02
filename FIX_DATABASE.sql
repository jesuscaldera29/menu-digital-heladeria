-- 1. Agregar la columna 'is_open' a la tabla 'cash_closings' (Para la apertura de caja)
ALTER TABLE cash_closings
ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;

-- 2. Agregar la columna 'pos_only' a la tabla 'products' (Para que no salgan en el menú digital)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS pos_only BOOLEAN DEFAULT false;

-- IMPORTANTE:
-- Después de ejecutar este código, debes ir a:
-- Settings (Engranaje) > API > "Reload Schema Cache" o "Clear Cache".
-- De lo contrario, los errores rojos podrían seguir apareciendo.

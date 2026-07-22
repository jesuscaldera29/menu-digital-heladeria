-- ============================================================
-- MENÚ DIGITAL - ACTUALIZACIÓN DE INVENTARIO Y STOCK
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Añadir columnas a la tabla products
ALTER TABLE products ADD COLUMN IF NOT EXISTS manage_stock BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock NUMERIC DEFAULT 0;

-- 2. Función para reducir el stock al confirmar una orden
CREATE OR REPLACE FUNCTION reduce_stock_on_order()
RETURNS TRIGGER AS $$
DECLARE
  item JSONB;
  prod_id UUID;
  qty NUMERIC;
BEGIN
  -- Iterar sobre el array de items en la nueva orden (NEW.items es un array JSONB)
  IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      -- Intentar extraer el ID del producto (dependiendo de la estructura del carrito)
      prod_id := NULL;
      BEGIN
        prod_id := (item->>'id')::UUID;
      EXCEPTION WHEN OTHERS THEN
        prod_id := NULL; -- Si el id no es un UUID válido (ej. extras, combinaciones)
      END;

      IF prod_id IS NOT NULL THEN
        -- Extraer la cantidad (qty o quantity)
        qty := COALESCE((item->>'qty')::NUMERIC, (item->>'quantity')::NUMERIC, 1);

        -- Actualizar el stock del producto (reducirlo) solo si manage_stock es true
        UPDATE products
        SET stock = GREATEST(stock - qty, 0)
        WHERE id = prod_id AND manage_stock = TRUE;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger para ejecutar la función después de un insert en orders
DROP TRIGGER IF EXISTS trigger_reduce_stock_on_order ON orders;
CREATE TRIGGER trigger_reduce_stock_on_order
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION reduce_stock_on_order();

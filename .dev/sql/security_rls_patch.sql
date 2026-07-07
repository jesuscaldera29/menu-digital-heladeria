-- ============================================================
-- PARCHE DE SEGURIDAD INTEGRAL (RLS, RPC y Storage)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ==========================================
-- 1. FUNCIÓN SEGURA PARA ESTADO DE PEDIDOS (RPC)
-- ==========================================
-- Esto permite que el cliente lea su propio pedido sabiendo el UUID
-- sin tener que abrir la tabla orders al público (USING true).
CREATE OR REPLACE FUNCTION get_order_status_secure(p_order_id UUID)
RETURNS TABLE (
  id UUID,
  customer_name TEXT,
  total NUMERIC,
  status TEXT,
  items JSONB,
  created_at TIMESTAMPTZ,
  turn_number INTEGER,
  business_id UUID,
  business_name TEXT,
  currency TEXT,
  delivery_fee NUMERIC,
  delivery_method TEXT,
  discount NUMERIC,
  address TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.customer_name,
    o.total,
    o.status,
    o.items,
    o.created_at,
    o.turn_number,
    o.business_id,
    s.business_name,
    s.currency,
    o.delivery_fee,
    o.delivery_method,
    o.discount,
    o.address
  FROM orders o
  JOIN settings s ON o.business_id = s.business_id
  WHERE o.id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 2. BLOQUEO DE RLS PARA ORDERS Y CUSTOMERS
-- ==========================================

-- Cerrar lectura abierta de Orders (antes estaba USING true)
DROP POLICY IF EXISTS "read_orders" ON orders;
CREATE POLICY "read_orders" ON orders FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- Cerrar lectura abierta de Customers (antes estaba USING true)
DROP POLICY IF EXISTS "read_customers" ON customers;
CREATE POLICY "read_customers" ON customers FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- (Los INSERT se mantienen públicos para permitir que la gente pida desde el menú)


-- ==========================================
-- 3. SEGURIDAD EN STORAGE (IMÁGENES)
-- ==========================================
-- Evitar que un atacante suba scripts (.js, .php, .html) al bucket "images".
-- Opcional: También limita para que solo personal/dueño pueda subir.

DROP POLICY IF EXISTS "Staff and owners can upload images" ON storage.objects;
CREATE POLICY "Staff and owners can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'images'
  AND (
    auth.uid() IN (SELECT owner_id FROM businesses)
    OR
    auth.uid() IN (SELECT user_id FROM staff)
  )
);

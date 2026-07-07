-- ============================================================
-- ACTUALIZACIÓN DE CLIENTES EN SUPERADMIN
-- Ejecuta este script en el SQL Editor de Supabase
-- ============================================================

-- 1. Agregar columnas a la tabla businesses para guardar datos del admin
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS admin_password TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS admin_phone TEXT;

-- 2. Actualizar la vista del super admin para incluir estas columnas
DROP VIEW IF EXISTS superadmin_businesses_view;
CREATE OR REPLACE VIEW superadmin_businesses_view AS
SELECT 
  b.id,
  b.business_name,
  b.slug,
  b.is_active,
  b.plan,
  b.created_at,
  b.admin_email,
  b.admin_password,
  b.admin_phone,
  s.whatsapp,
  (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id) as products_count,
  (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) as orders_count
FROM businesses b
LEFT JOIN settings s ON s.business_id = b.id;

GRANT SELECT ON superadmin_businesses_view TO authenticated;

-- 3. Actualizar la función para crear negocio
CREATE OR REPLACE FUNCTION create_business_with_settings(
  p_owner_id UUID,
  p_slug TEXT,
  p_business_name TEXT,
  p_admin_email TEXT DEFAULT NULL,
  p_admin_password TEXT DEFAULT NULL,
  p_admin_phone TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_business_id UUID;
BEGIN
  -- Crear el negocio con los datos extra
  INSERT INTO businesses (owner_id, slug, business_name, admin_email, admin_password, admin_phone)
  VALUES (p_owner_id, p_slug, p_business_name, p_admin_email, p_admin_password, p_admin_phone)
  RETURNING id INTO v_business_id;
  
  -- Crear settings por defecto
  INSERT INTO settings (logo_url, whatsapp, business_name, currency, business_id)
  VALUES ('', '', p_business_name, 'COP', v_business_id);
  
  RETURN v_business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

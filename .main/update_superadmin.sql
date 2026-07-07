-- ============================================================
-- ACTUALIZACIÓN PARA EL PANEL SUPER ADMIN
-- Ejecuta esto en Supabase SQL Editor
-- ============================================================

-- 1. Agregar columna is_active para poder bloquear restaurantes
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Crear una política para que el SUPER ADMIN pueda modificar cualquier negocio
-- ⚠️ IMPORTANTE: REEMPLAZA EL CORREO POR TU CORREO REAL CON EL QUE TE REGISTRASTE EN LA PLATAFORMA
DROP POLICY IF EXISTS "super_admin_all_businesses" ON businesses;

CREATE POLICY "super_admin_all_businesses" ON businesses 
  FOR ALL 
  USING (auth.jwt() ->> 'email' = 'jesuscaldera2000@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'jesuscaldera2000@gmail.com');

-- 3. Crear una vista para facilitar la carga de datos en el Super Admin (negocios + sus settings base)
CREATE OR REPLACE VIEW superadmin_businesses_view AS
SELECT 
  b.id,
  b.business_name,
  b.slug,
  b.is_active,
  b.plan,
  b.created_at,
  s.whatsapp,
  (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id) as products_count,
  (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) as orders_count
FROM businesses b
LEFT JOIN settings s ON s.business_id = b.id;

-- Dale permisos al super admin para leer la vista
GRANT SELECT ON superadmin_businesses_view TO authenticated;

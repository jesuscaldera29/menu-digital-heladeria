-- ============================================================
-- AGREGA EL CAMPO SYSTEM_MODE A LA TABLA SETTINGS
-- ============================================================
-- Este campo determina si un negocio tiene el sistema completo
-- ('full') o la versión reducida ('menu_only').

ALTER TABLE settings ADD COLUMN IF NOT EXISTS system_mode TEXT DEFAULT 'full';

-- Si alguna fila quedó con NULL, la actualizamos a 'full' por defecto
UPDATE settings SET system_mode = 'full' WHERE system_mode IS NULL;

-- Actualizar la vista del super admin para incluir system_mode
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
  s.system_mode,
  (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id) as products_count,
  (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) as orders_count
FROM businesses b
LEFT JOIN settings s ON s.business_id = b.id;

GRANT SELECT ON superadmin_businesses_view TO authenticated;

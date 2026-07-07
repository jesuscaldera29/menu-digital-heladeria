-- ============================================================
-- MIGRACIÓN DE DATOS EXISTENTES
-- ============================================================
-- ⚠️ EJECUTAR DESPUÉS DE:
-- 1. multi_tenant_setup.sql
-- 2. Haber creado tu cuenta desde register.html
-- 
-- INSTRUCCIONES:
-- 1. Registra tu cuenta en register.html
-- 2. Ve a Supabase → Table Editor → businesses
-- 3. Copia el UUID de tu negocio (columna "id")
-- 4. Reemplaza 'TU_BUSINESS_ID_AQUI' abajo con ese UUID
-- 5. Ejecuta este script en SQL Editor
-- ============================================================

-- ⬇️ REEMPLAZA ESTE VALOR con el UUID de tu negocio ⬇️
DO $$
DECLARE
  v_business_id UUID := 'TU_BUSINESS_ID_AQUI';
BEGIN
  -- Vincular productos existentes
  UPDATE products SET business_id = v_business_id WHERE business_id IS NULL;
  
  -- Vincular pedidos existentes
  UPDATE orders SET business_id = v_business_id WHERE business_id IS NULL;
  
  -- Vincular clientes existentes
  UPDATE customers SET business_id = v_business_id WHERE business_id IS NULL;
  
  -- Vincular settings existentes (actualizar el registro por defecto)
  UPDATE settings SET business_id = v_business_id WHERE id = 1 AND business_id IS NULL;
  
  RAISE NOTICE 'Migración completada. Datos vinculados al negocio: %', v_business_id;
END $$;

-- ============================================================
-- VERIFICACIÓN: Ejecuta estas consultas para confirmar
-- ============================================================
-- SELECT COUNT(*) as productos_migrados FROM products WHERE business_id IS NOT NULL;
-- SELECT COUNT(*) as pedidos_migrados FROM orders WHERE business_id IS NOT NULL;
-- SELECT COUNT(*) as clientes_migrados FROM customers WHERE business_id IS NOT NULL;
-- SELECT COUNT(*) as settings_migrados FROM settings WHERE business_id IS NOT NULL;

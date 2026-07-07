-- ============================================================
-- MULTI-TENANT SETUP - EJECUTAR EN SUPABASE SQL EDITOR
-- ============================================================
-- ⚠️ EJECUTAR ESTE SCRIPT DESPUÉS DE setup.sql
-- Este script convierte el sistema single-tenant en multi-tenant
-- ============================================================

-- 1. Tabla principal de negocios
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agregar business_id a tablas existentes (nullable para migración)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'business_id') THEN
    ALTER TABLE settings ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'business_id') THEN
    ALTER TABLE products ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'business_id') THEN
    ALTER TABLE orders ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'business_id') THEN
    ALTER TABLE customers ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Agregar columnas adicionales a settings si no existen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'menu_url') THEN
    ALTER TABLE settings ADD COLUMN menu_url TEXT DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'table_count') THEN
    ALTER TABLE settings ADD COLUMN table_count INTEGER DEFAULT 1;
  END IF;
END $$;

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_settings_business ON settings(business_id);

-- 5. RLS Policies para businesses
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_read_businesses" ON businesses;
DROP POLICY IF EXISTS "owners_manage_businesses" ON businesses;
DROP POLICY IF EXISTS "auth_insert_businesses" ON businesses;

CREATE POLICY "anyone_read_businesses" ON businesses
  FOR SELECT USING (true);

CREATE POLICY "owners_manage_businesses" ON businesses
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "auth_insert_businesses" ON businesses
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- 6. RLS Policies para settings (multi-tenant)
DROP POLICY IF EXISTS "read_settings" ON settings;
DROP POLICY IF EXISTS "update_settings" ON settings;
DROP POLICY IF EXISTS "insert_settings" ON settings;

CREATE POLICY "read_settings" ON settings
  FOR SELECT USING (true);

CREATE POLICY "update_settings" ON settings
  FOR UPDATE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "insert_settings" ON settings
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- 7. RLS Policies para products (multi-tenant)
DROP POLICY IF EXISTS "read_products" ON products;
DROP POLICY IF EXISTS "insert_products" ON products;
DROP POLICY IF EXISTS "update_products" ON products;
DROP POLICY IF EXISTS "delete_products" ON products;

CREATE POLICY "read_products" ON products
  FOR SELECT USING (true);

CREATE POLICY "insert_products" ON products
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "update_products" ON products
  FOR UPDATE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

CREATE POLICY "delete_products" ON products
  FOR DELETE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- 8. RLS Policies para orders (multi-tenant)
DROP POLICY IF EXISTS "read_orders" ON orders;
DROP POLICY IF EXISTS "insert_orders" ON orders;
DROP POLICY IF EXISTS "update_orders" ON orders;

-- Cualquiera puede leer pedidos (para order-status.html)
CREATE POLICY "read_orders" ON orders
  FOR SELECT USING (true);

-- Cualquiera puede crear pedidos (clientes del menú)
CREATE POLICY "insert_orders" ON orders
  FOR INSERT WITH CHECK (true);

-- Solo el dueño puede actualizar estados
CREATE POLICY "update_orders" ON orders
  FOR UPDATE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- 9. RLS Policies para customers (multi-tenant)
DROP POLICY IF EXISTS "read_customers" ON customers;
DROP POLICY IF EXISTS "insert_customers" ON customers;
DROP POLICY IF EXISTS "update_customers" ON customers;

CREATE POLICY "read_customers" ON customers
  FOR SELECT USING (true);

CREATE POLICY "insert_customers" ON customers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "update_customers" ON customers
  FOR UPDATE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

-- 10. Función para crear un negocio con su settings por defecto
CREATE OR REPLACE FUNCTION create_business_with_settings(
  p_owner_id UUID,
  p_slug TEXT,
  p_business_name TEXT
)
RETURNS UUID AS $$
DECLARE
  v_business_id UUID;
BEGIN
  -- Crear el negocio
  INSERT INTO businesses (owner_id, slug, business_name)
  VALUES (p_owner_id, p_slug, p_business_name)
  RETURNING id INTO v_business_id;
  
  -- Crear settings por defecto
  INSERT INTO settings (logo_url, whatsapp, business_name, currency, business_id)
  VALUES ('', '', p_business_name, 'COP', v_business_id);
  
  RETURN v_business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DESPUÉS DE EJECUTAR ESTO:
-- 1. Ve a Authentication → Settings → Habilitar "Email" provider
-- 2. Desactiva "Confirm email" si quieres registro inmediato
-- 3. Registra tu primera cuenta desde register.html
-- 4. Ejecuta migrate_existing_data.sql para vincular datos existentes
-- ============================================================

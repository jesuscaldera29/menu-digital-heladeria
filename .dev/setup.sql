-- ============================================================
-- MENÚ DIGITAL - EJECUTAR TODO EN SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tabla de configuración
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  logo_url TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  business_name TEXT DEFAULT 'Mi Negocio',
  currency TEXT DEFAULT 'COP',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (id, logo_url, whatsapp, business_name, currency) 
VALUES (1, '', '', 'Mi Negocio', 'COP')
ON CONFLICT (id) DO NOTHING;

-- 2. Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de clientes (FALTABA EN EL ORIGINAL)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de pedidos (FALTABA EN EL ORIGINAL)
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  total NUMERIC NOT NULL DEFAULT 0,
  delivery_method TEXT DEFAULT 'Domicilio',
  payment_method TEXT DEFAULT 'Efectivo',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'Pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS Policies para settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_settings" ON settings;
DROP POLICY IF EXISTS "update_settings" ON settings;
CREATE POLICY "read_settings" ON settings FOR SELECT USING (true);
CREATE POLICY "update_settings" ON settings FOR UPDATE USING (true);

-- 6. RLS Policies para products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_products" ON products;
DROP POLICY IF EXISTS "insert_products" ON products;
DROP POLICY IF EXISTS "update_products" ON products;
DROP POLICY IF EXISTS "delete_products" ON products;
CREATE POLICY "read_products" ON products FOR SELECT USING (true);
CREATE POLICY "insert_products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "update_products" ON products FOR UPDATE USING (true);
CREATE POLICY "delete_products" ON products FOR DELETE USING (true);

-- 7. RLS Policies para customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_customers" ON customers;
DROP POLICY IF EXISTS "insert_customers" ON customers;
DROP POLICY IF EXISTS "update_customers" ON customers;
CREATE POLICY "read_customers" ON customers FOR SELECT USING (true);
CREATE POLICY "insert_customers" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "update_customers" ON customers FOR UPDATE USING (true);

-- 8. RLS Policies para orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_orders" ON orders;
DROP POLICY IF EXISTS "insert_orders" ON orders;
DROP POLICY IF EXISTS "update_orders" ON orders;
CREATE POLICY "read_orders" ON orders FOR SELECT USING (true);
CREATE POLICY "insert_orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "update_orders" ON orders FOR UPDATE USING (true);

-- ============================================================
-- DESPUÉS DE EJECUTAR ESTO:
-- Ve a Storage → New bucket → Name: "images" → Public: activado
-- ============================================================

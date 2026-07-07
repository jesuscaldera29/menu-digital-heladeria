-- ============================================================
-- MENÚ DIGITAL HELADERÍA - SETUP COMPLETO
-- Ejecutar en Supabase SQL Editor (nueva instancia)
-- URL: https://vtckqdbfqcqjtznrsdwx.supabase.co
-- ============================================================

-- ============================================================
-- SECCIÓN 1: TABLAS BASE (setup.sql + multi_tenant_setup.sql)
-- ============================================================

-- 1. Tabla principal de negocios
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  is_active BOOLEAN DEFAULT TRUE,
  admin_email TEXT DEFAULT '',
  admin_password TEXT DEFAULT '',
  admin_phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de configuración
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  logo_url TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  business_name TEXT DEFAULT 'Mi Negocio',
  currency TEXT DEFAULT 'COP',
  menu_url TEXT DEFAULT '',
  table_count INTEGER DEFAULT 1,
  brand_color TEXT DEFAULT '#f97316',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  accompaniments TEXT DEFAULT '',
  accompaniments_limit INTEGER,
  available BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de clientes
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  neighborhood TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, phone)
);

-- 5. Tabla de pedidos
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  total NUMERIC NOT NULL DEFAULT 0,
  delivery_method TEXT DEFAULT 'Domicilio',
  payment_method TEXT DEFAULT 'Efectivo',
  address TEXT DEFAULT '',
  neighborhood TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'Pendiente',
  tip NUMERIC DEFAULT 0,
  coupon_code TEXT DEFAULT '',
  discount NUMERIC DEFAULT 0,
  branch_id UUID,
  driver_id UUID,
  delivery_fee NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Product Extras (Visual Extras Manager)
CREATE TABLE IF NOT EXISTS product_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Landing Settings
CREATE TABLE IF NOT EXISTS landing_settings (
  id SERIAL PRIMARY KEY,
  hero_image_url TEXT DEFAULT '',
  admin_image_url TEXT DEFAULT '',
  mobile_image_url TEXT DEFAULT '',
  qr_image_url TEXT DEFAULT '',
  developer_image_url TEXT DEFAULT '',
  fb_pixel_id TEXT DEFAULT '',
  fb_api_token TEXT DEFAULT '',
  price_old TEXT DEFAULT '',
  price_current TEXT DEFAULT '',
  spots_left INTEGER DEFAULT 3,
  whatsapp_number TEXT DEFAULT '573015027933',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO landing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SECCIÓN 2: TABLAS NUEVAS - SUCURSALES (Fase 1)
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar FK a orders
ALTER TABLE orders ADD CONSTRAINT fk_orders_branch 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- ============================================================
-- SECCIÓN 3: TABLAS NUEVAS - GASTOS Y FINANZAS (Fase 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE,
  expected_total NUMERIC DEFAULT 0,
  declared_total NUMERIC DEFAULT 0,
  difference NUMERIC DEFAULT 0,
  cash_sales NUMERIC DEFAULT 0,
  transfer_sales NUMERIC DEFAULT 0,
  card_sales NUMERIC DEFAULT 0,
  total_expenses NUMERIC DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SECCIÓN 4: TABLAS NUEVAS - PERSONAL Y TURNOS (Fase 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Empleado',
  phone TEXT DEFAULT '',
  email TEXT,
  password TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES delivery_drivers(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  total_hours NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SECCIÓN 5: TABLAS NUEVAS - CUPONES Y FIDELIZACIÓN (Fase 3)
-- ============================================================

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type TEXT DEFAULT 'percentage',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  min_order NUMERIC DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, customer_phone)
);

-- ============================================================
-- SECCIÓN 6: TABLAS NUEVAS - CRÉDITOS (Fase 4)
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  balance NUMERIC DEFAULT 0,
  credit_limit NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, customer_phone)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_account_id UUID REFERENCES credit_accounts(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  order_id INTEGER,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SECCIÓN 7: TABLAS NUEVAS - REPARTIDORES (Fase 4)
-- ============================================================

CREATE TABLE IF NOT EXISTS delivery_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders ADD CONSTRAINT fk_orders_driver 
  FOREIGN KEY (driver_id) REFERENCES delivery_drivers(id) ON DELETE SET NULL;

-- ============================================================
-- SECCIÓN 8: TABLAS NUEVAS - RECETAS (Fase 5)
-- ============================================================

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  ingredients JSONB DEFAULT '[]',
  instructions TEXT DEFAULT '',
  estimated_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SECCIÓN 9: ÍNDICES DE RENDIMIENTO
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_settings_business ON settings(business_id);
CREATE INDEX IF NOT EXISTS idx_product_extras_product ON product_extras(product_id);
CREATE INDEX IF NOT EXISTS idx_branches_business ON branches(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_cash_closings_business ON cash_closings(business_id);
CREATE INDEX IF NOT EXISTS idx_staff_business ON staff(business_id);
CREATE INDEX IF NOT EXISTS idx_shifts_staff ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_coupons_business ON coupons(business_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_loyalty_business ON loyalty_points(business_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_business ON credit_accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_delivery_drivers_business ON delivery_drivers(business_id);
CREATE INDEX IF NOT EXISTS idx_recipes_business ON recipes(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- ============================================================
-- SECCIÓN 10: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- businesses
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_read_businesses" ON businesses;
DROP POLICY IF EXISTS "owners_manage_businesses" ON businesses;
DROP POLICY IF EXISTS "auth_insert_businesses" ON businesses;
DROP POLICY IF EXISTS "superadmin_all_businesses" ON businesses;
CREATE POLICY "anyone_read_businesses" ON businesses FOR SELECT USING (true);
CREATE POLICY "owners_manage_businesses" ON businesses FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "auth_insert_businesses" ON businesses FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "superadmin_delete_businesses" ON businesses FOR DELETE USING (true);

-- settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_settings" ON settings;
DROP POLICY IF EXISTS "update_settings" ON settings;
DROP POLICY IF EXISTS "insert_settings" ON settings;
CREATE POLICY "read_settings" ON settings FOR SELECT USING (true);
CREATE POLICY "update_settings" ON settings FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "insert_settings" ON settings FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_products" ON products;
DROP POLICY IF EXISTS "insert_products" ON products;
DROP POLICY IF EXISTS "update_products" ON products;
DROP POLICY IF EXISTS "delete_products" ON products;
CREATE POLICY "read_products" ON products FOR SELECT USING (true);
CREATE POLICY "insert_products" ON products FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "update_products" ON products FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "delete_products" ON products FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_orders" ON orders;
DROP POLICY IF EXISTS "insert_orders" ON orders;
DROP POLICY IF EXISTS "update_orders" ON orders;
DROP POLICY IF EXISTS "delete_orders" ON orders;
CREATE POLICY "read_orders" ON orders FOR SELECT USING (true);
CREATE POLICY "insert_orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "update_orders" ON orders FOR UPDATE USING (true);
CREATE POLICY "delete_orders" ON orders FOR DELETE USING (true);

-- customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_customers" ON customers;
DROP POLICY IF EXISTS "insert_customers" ON customers;
DROP POLICY IF EXISTS "update_customers" ON customers;
DROP POLICY IF EXISTS "delete_customers" ON customers;
CREATE POLICY "read_customers" ON customers FOR SELECT USING (true);
CREATE POLICY "insert_customers" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "update_customers" ON customers FOR UPDATE USING (true);
CREATE POLICY "delete_customers" ON customers FOR DELETE USING (true);

-- product_extras
ALTER TABLE product_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_product_extras" ON product_extras;
DROP POLICY IF EXISTS "insert_product_extras" ON product_extras;
DROP POLICY IF EXISTS "update_product_extras" ON product_extras;
DROP POLICY IF EXISTS "delete_product_extras" ON product_extras;
CREATE POLICY "read_product_extras" ON product_extras FOR SELECT USING (true);
CREATE POLICY "insert_product_extras" ON product_extras FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "update_product_extras" ON product_extras FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "delete_product_extras" ON product_extras FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- landing_settings
ALTER TABLE landing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_landing" ON landing_settings;
DROP POLICY IF EXISTS "update_landing" ON landing_settings;
CREATE POLICY "read_landing" ON landing_settings FOR SELECT USING (true);
CREATE POLICY "update_landing" ON landing_settings FOR UPDATE USING (true);

-- branches
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_branches" ON branches;
DROP POLICY IF EXISTS "manage_branches" ON branches;
CREATE POLICY "read_branches" ON branches FOR SELECT USING (true);
CREATE POLICY "manage_branches_insert" ON branches FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "manage_branches_update" ON branches FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "manage_branches_delete" ON branches FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_expenses" ON expenses;
DROP POLICY IF EXISTS "insert_expenses" ON expenses;
DROP POLICY IF EXISTS "update_expenses" ON expenses;
DROP POLICY IF EXISTS "delete_expenses" ON expenses;
CREATE POLICY "read_expenses" ON expenses FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "insert_expenses" ON expenses FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "update_expenses" ON expenses FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "delete_expenses" ON expenses FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- cash_closings
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_cash_closings" ON cash_closings;
DROP POLICY IF EXISTS "insert_cash_closings" ON cash_closings;
CREATE POLICY "read_cash_closings" ON cash_closings FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "insert_cash_closings" ON cash_closings FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- staff
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_staff" ON staff;
DROP POLICY IF EXISTS "insert_staff" ON staff;
DROP POLICY IF EXISTS "update_staff" ON staff;
DROP POLICY IF EXISTS "delete_staff" ON staff;
CREATE POLICY "read_staff" ON staff FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "insert_staff" ON staff FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "update_staff" ON staff FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "delete_staff" ON staff FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_shifts" ON shifts;
DROP POLICY IF EXISTS "insert_shifts" ON shifts;
DROP POLICY IF EXISTS "update_shifts" ON shifts;
CREATE POLICY "read_shifts" ON shifts FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "insert_shifts" ON shifts FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "update_shifts" ON shifts FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- coupons
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_coupons" ON coupons;
DROP POLICY IF EXISTS "insert_coupons" ON coupons;
DROP POLICY IF EXISTS "update_coupons" ON coupons;
DROP POLICY IF EXISTS "delete_coupons" ON coupons;
CREATE POLICY "read_coupons" ON coupons FOR SELECT USING (true);
CREATE POLICY "insert_coupons" ON coupons FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "update_coupons" ON coupons FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "delete_coupons" ON coupons FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- loyalty_points
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_loyalty" ON loyalty_points;
DROP POLICY IF EXISTS "insert_loyalty" ON loyalty_points;
DROP POLICY IF EXISTS "update_loyalty" ON loyalty_points;
CREATE POLICY "read_loyalty" ON loyalty_points FOR SELECT USING (true);
CREATE POLICY "insert_loyalty" ON loyalty_points FOR INSERT WITH CHECK (true);
CREATE POLICY "update_loyalty" ON loyalty_points FOR UPDATE USING (true);

-- credit_accounts
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_credits" ON credit_accounts;
DROP POLICY IF EXISTS "insert_credits" ON credit_accounts;
DROP POLICY IF EXISTS "update_credits" ON credit_accounts;
DROP POLICY IF EXISTS "delete_credits" ON credit_accounts;
CREATE POLICY "read_credits" ON credit_accounts FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "insert_credits" ON credit_accounts FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "update_credits" ON credit_accounts FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "delete_credits" ON credit_accounts FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- credit_transactions
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_credit_tx" ON credit_transactions;
DROP POLICY IF EXISTS "insert_credit_tx" ON credit_transactions;
CREATE POLICY "read_credit_tx" ON credit_transactions FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "insert_credit_tx" ON credit_transactions FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- delivery_drivers
ALTER TABLE delivery_drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_drivers" ON delivery_drivers;
DROP POLICY IF EXISTS "insert_drivers" ON delivery_drivers;
DROP POLICY IF EXISTS "update_drivers" ON delivery_drivers;
DROP POLICY IF EXISTS "delete_drivers" ON delivery_drivers;
CREATE POLICY "read_drivers" ON delivery_drivers FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "insert_drivers" ON delivery_drivers FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "update_drivers" ON delivery_drivers FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "delete_drivers" ON delivery_drivers FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- recipes
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_recipes" ON recipes;
DROP POLICY IF EXISTS "insert_recipes" ON recipes;
DROP POLICY IF EXISTS "update_recipes" ON recipes;
DROP POLICY IF EXISTS "delete_recipes" ON recipes;
CREATE POLICY "read_recipes" ON recipes FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "insert_recipes" ON recipes FOR INSERT WITH CHECK (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "update_recipes" ON recipes FOR UPDATE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "delete_recipes" ON recipes FOR DELETE USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- ============================================================
-- SECCIÓN 11: FUNCIONES
-- ============================================================

-- Función para crear negocio con settings
CREATE OR REPLACE FUNCTION create_business_with_settings(
  p_owner_id UUID,
  p_slug TEXT,
  p_business_name TEXT,
  p_admin_email TEXT DEFAULT '',
  p_admin_password TEXT DEFAULT '',
  p_admin_phone TEXT DEFAULT ''
)
RETURNS UUID AS $$
DECLARE
  v_business_id UUID;
BEGIN
  INSERT INTO businesses (owner_id, slug, business_name, admin_email, admin_password, admin_phone)
  VALUES (p_owner_id, p_slug, p_business_name, p_admin_email, p_admin_password, p_admin_phone)
  RETURNING id INTO v_business_id;
  
  INSERT INTO settings (logo_url, whatsapp, business_name, currency, business_id)
  VALUES ('', '', p_business_name, 'COP', v_business_id);
  
  RETURN v_business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SECCIÓN 12: VISTA SUPER ADMIN
-- ============================================================

CREATE OR REPLACE VIEW superadmin_businesses_view AS
SELECT 
  b.id,
  b.owner_id,
  b.slug,
  b.business_name,
  b.plan,
  b.is_active,
  b.admin_email,
  b.admin_password,
  b.admin_phone,
  b.created_at,
  s.whatsapp,
  (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id) as products_count,
  (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) as orders_count
FROM businesses b
LEFT JOIN settings s ON s.business_id = b.id;

-- ============================================================
-- DESPUÉS DE EJECUTAR:
-- 1. Ve a Storage → New bucket → Name: "images" → Public: ON
-- 2. Ve a Authentication → Settings → Email provider → ON
-- 3. Desactiva "Confirm email" para registro inmediato
-- ============================================================

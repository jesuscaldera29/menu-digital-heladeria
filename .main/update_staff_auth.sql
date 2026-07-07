-- ============================================================
-- MIGRACIÓN: AUTENTICACIÓN Y ROLES DE PERSONAL
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Modificar tabla staff para soportar credenciales
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES delivery_drivers(id) ON DELETE SET NULL;

-- Crear índice para mejorar consultas por user_id
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);

-- 2. Actualizar políticas RLS para soportar accesos del personal
-- Las consultas validan si el usuario es el dueño (auth.uid() = owner_id)
-- o si es un empleado del negocio (business_id = staff.business_id y staff.user_id = auth.uid())

-- Helper conceptual de subconsulta:
-- business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())

-- == EXPENSES RLS ==
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_expenses" ON expenses;
DROP POLICY IF EXISTS "insert_expenses" ON expenses;
DROP POLICY IF EXISTS "update_expenses" ON expenses;
DROP POLICY IF EXISTS "delete_expenses" ON expenses;

CREATE POLICY "read_expenses" ON expenses FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_expenses" ON expenses FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_expenses" ON expenses FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_expenses" ON expenses FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == CASH CLOSINGS RLS ==
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_cash_closings" ON cash_closings;
DROP POLICY IF EXISTS "insert_cash_closings" ON cash_closings;

CREATE POLICY "read_cash_closings" ON cash_closings FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_cash_closings" ON cash_closings FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == STAFF RLS ==
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_staff" ON staff;
DROP POLICY IF EXISTS "insert_staff" ON staff;
DROP POLICY IF EXISTS "update_staff" ON staff;
DROP POLICY IF EXISTS "delete_staff" ON staff;

CREATE POLICY "read_staff" ON staff FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_staff" ON staff FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_staff" ON staff FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_staff" ON staff FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == SHIFTS RLS ==
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_shifts" ON shifts;
DROP POLICY IF EXISTS "insert_shifts" ON shifts;
DROP POLICY IF EXISTS "update_shifts" ON shifts;

CREATE POLICY "read_shifts" ON shifts FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_shifts" ON shifts FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_shifts" ON shifts FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == CREDIT ACCOUNTS RLS ==
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_credits" ON credit_accounts;
DROP POLICY IF EXISTS "insert_credits" ON credit_accounts;
DROP POLICY IF EXISTS "update_credits" ON credit_accounts;
DROP POLICY IF EXISTS "delete_credits" ON credit_accounts;

CREATE POLICY "read_credits" ON credit_accounts FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_credits" ON credit_accounts FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_credits" ON credit_accounts FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_credits" ON credit_accounts FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == CREDIT TRANSACTIONS RLS ==
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_credit_tx" ON credit_transactions;
DROP POLICY IF EXISTS "insert_credit_tx" ON credit_transactions;

CREATE POLICY "read_credit_tx" ON credit_transactions FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_credit_tx" ON credit_transactions FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == DELIVERY DRIVERS RLS ==
ALTER TABLE delivery_drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_drivers" ON delivery_drivers;
DROP POLICY IF EXISTS "insert_drivers" ON delivery_drivers;
DROP POLICY IF EXISTS "update_drivers" ON delivery_drivers;
DROP POLICY IF EXISTS "delete_drivers" ON delivery_drivers;

CREATE POLICY "read_drivers" ON delivery_drivers FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_drivers" ON delivery_drivers FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_drivers" ON delivery_drivers FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_drivers" ON delivery_drivers FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == RECIPES RLS ==
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_recipes" ON recipes;
DROP POLICY IF EXISTS "insert_recipes" ON recipes;
DROP POLICY IF EXISTS "update_recipes" ON recipes;
DROP POLICY IF EXISTS "delete_recipes" ON recipes;

CREATE POLICY "read_recipes" ON recipes FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_recipes" ON recipes FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_recipes" ON recipes FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_recipes" ON recipes FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == PRODUCTS WRITE ACCESS RLS ==
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "insert_products" ON products;
DROP POLICY IF EXISTS "update_products" ON products;
DROP POLICY IF EXISTS "delete_products" ON products;

CREATE POLICY "insert_products" ON products FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_products" ON products FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_products" ON products FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- == SETTINGS WRITE ACCESS RLS ==
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "update_settings" ON settings;
DROP POLICY IF EXISTS "insert_settings" ON settings;

CREATE POLICY "update_settings" ON settings FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_settings" ON settings FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

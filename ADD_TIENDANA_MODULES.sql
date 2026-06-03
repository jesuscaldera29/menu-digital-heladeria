-- ============================================================
-- TIENDANA-STYLE MODULES: Proveedores, Compras, Movimientos de Caja
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Tabla de Proveedores
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_business ON suppliers(business_id);

-- 2. Tabla de Compras (Abastecimiento)
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT DEFAULT '',
  items JSONB DEFAULT '[]',
  total NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'Efectivo',
  notes TEXT DEFAULT '',
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_business ON purchases(business_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);

-- 3. Movimientos de Caja (Depósitos / Salidas)
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_business ON cash_movements(business_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_suppliers" ON suppliers FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_suppliers" ON suppliers FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_suppliers" ON suppliers FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_suppliers" ON suppliers FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_purchases" ON purchases FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_purchases" ON purchases FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "update_purchases" ON purchases FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_purchases" ON purchases FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

-- cash_movements
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_cash_movements" ON cash_movements FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "insert_cash_movements" ON cash_movements FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);
CREATE POLICY "delete_cash_movements" ON cash_movements FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid() UNION SELECT business_id FROM staff WHERE user_id = auth.uid())
);

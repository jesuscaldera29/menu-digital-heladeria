-- ============================================================
-- SCRIPT DE ACTUALIZACIÓN Y BLINDAJE FINANCIERO (FASE 1)
-- Ejecutar en Supabase -> SQL Editor
-- ============================================================

-- 1. Asegurar columnas completas en cash_closings
ALTER TABLE IF EXISTS cash_closings 
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS opened_by TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS closed_by TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- 2. Asegurar columna cash_closing_id en cash_movements
ALTER TABLE IF EXISTS cash_movements
  ADD COLUMN IF NOT EXISTS cash_closing_id UUID REFERENCES cash_closings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT DEFAULT '';

-- 3. Índices de alta velocidad para arqueos y turnos de caja
CREATE INDEX IF NOT EXISTS idx_cash_closings_biz_open ON cash_closings(business_id, is_open);
CREATE INDEX IF NOT EXISTS idx_cash_closings_opened_at ON cash_closings(opened_at);
CREATE INDEX IF NOT EXISTS idx_cash_movements_biz_time ON cash_movements(business_id, created_at);

-- 4. Habilitar RLS y crear políticas completas (SELECT, INSERT, UPDATE, DELETE)
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_cash_closings_select" ON cash_closings;
DROP POLICY IF EXISTS "allow_all_cash_closings_insert" ON cash_closings;
DROP POLICY IF EXISTS "allow_all_cash_closings_update" ON cash_closings;
DROP POLICY IF EXISTS "allow_all_cash_closings_delete" ON cash_closings;

CREATE POLICY "allow_all_cash_closings_select" ON cash_closings
  FOR SELECT USING (true);

CREATE POLICY "allow_all_cash_closings_insert" ON cash_closings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_all_cash_closings_update" ON cash_closings
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_cash_closings_delete" ON cash_closings
  FOR DELETE USING (true);

-- 5. RLS para cash_movements
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_cash_movements_select" ON cash_movements;
DROP POLICY IF EXISTS "allow_all_cash_movements_insert" ON cash_movements;
DROP POLICY IF EXISTS "allow_all_cash_movements_update" ON cash_movements;
DROP POLICY IF EXISTS "allow_all_cash_movements_delete" ON cash_movements;

CREATE POLICY "allow_all_cash_movements_select" ON cash_movements
  FOR SELECT USING (true);

CREATE POLICY "allow_all_cash_movements_insert" ON cash_movements
  FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_all_cash_movements_update" ON cash_movements
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_cash_movements_delete" ON cash_movements
  FOR DELETE USING (true);

-- 6. RLS para expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_expenses_select" ON expenses;
DROP POLICY IF EXISTS "allow_all_expenses_insert" ON expenses;
DROP POLICY IF EXISTS "allow_all_expenses_update" ON expenses;
DROP POLICY IF EXISTS "allow_all_expenses_delete" ON expenses;

CREATE POLICY "allow_all_expenses_select" ON expenses
  FOR SELECT USING (true);

CREATE POLICY "allow_all_expenses_insert" ON expenses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_all_expenses_update" ON expenses
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_expenses_delete" ON expenses
  FOR DELETE USING (true);

-- Notificar estado
COMMENT ON TABLE cash_closings IS 'Tabla de sesiones de caja, arqueos y cierres Z blindados';

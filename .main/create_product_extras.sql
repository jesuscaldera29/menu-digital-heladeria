-- ============================================================
-- GESTOR DE EXTRAS VISUALES
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS product_extras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE product_extras ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (Borramos primero para evitar error si se ejecuta varias veces)
DROP POLICY IF EXISTS "Public read product_extras" ON product_extras;
CREATE POLICY "Public read product_extras" ON product_extras
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owner insert product_extras" ON product_extras;
CREATE POLICY "Owner insert product_extras" ON product_extras
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Owner update product_extras" ON product_extras;
CREATE POLICY "Owner update product_extras" ON product_extras
  FOR UPDATE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Owner delete product_extras" ON product_extras;
CREATE POLICY "Owner delete product_extras" ON product_extras
  FOR DELETE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  );

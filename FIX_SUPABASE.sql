-- ==========================================
-- SCRIPT DE CORRECCIÓN DE RECURSIÓN (STAFF)
-- ==========================================

-- 1. Eliminar políticas actuales que causan el loop infinito
DROP POLICY IF EXISTS "read_staff" ON staff;
DROP POLICY IF EXISTS "insert_staff" ON staff;
DROP POLICY IF EXISTS "update_staff" ON staff;
DROP POLICY IF EXISTS "delete_staff" ON staff;

-- 2. Crear las nuevas políticas optimizadas sin recursión
-- Lectura: Un empleado solo puede leer su propio registro, y el dueño puede leer a todos sus empleados.
CREATE POLICY "read_staff" ON staff FOR SELECT USING (
  user_id = auth.uid() OR business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
);

-- Inserción, Actualización y Borrado: Solo el dueño del negocio puede gestionar su personal
CREATE POLICY "insert_staff" ON staff FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
);

CREATE POLICY "update_staff" ON staff FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
);

CREATE POLICY "delete_staff" ON staff FOR DELETE USING (
  business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
);

-- 3. Agregar columna de color
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#f97316';
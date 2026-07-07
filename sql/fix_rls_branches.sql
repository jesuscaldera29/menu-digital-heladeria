-- =============================================
-- FIX RLS: Permitir que el owner inserte staff
-- en cualquier sucursal que le pertenezca
-- =============================================
-- Issue #5: Error "New row" al crear usuario en sucursal
-- El problema es que las políticas RLS de la tabla staff
-- solo permiten insertar a usuarios cuyo business_id 
-- coincide con su metadata, pero el owner necesita 
-- insertar en sucursales que no son su business_id directo.
-- =============================================

-- 1. Permitir INSERT en staff si el usuario es dueño del negocio
DROP POLICY IF EXISTS "Staff insert by owner" ON public.staff;
CREATE POLICY "Staff insert by owner" ON public.staff
  FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
    OR
    auth.uid() = (
      SELECT owner_id FROM public.businesses WHERE id = business_id
    )
  );

-- 2. Permitir SELECT en staff para owner de cualquier sucursal
DROP POLICY IF EXISTS "Staff select by owner" ON public.staff;
CREATE POLICY "Staff select by owner" ON public.staff
  FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
    OR
    user_id = auth.uid()
  );

-- 3. Permitir UPDATE en staff para owner
DROP POLICY IF EXISTS "Staff update by owner" ON public.staff;
CREATE POLICY "Staff update by owner" ON public.staff
  FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
    OR
    user_id = auth.uid()
  );

-- 4. Permitir DELETE en staff para owner
DROP POLICY IF EXISTS "Staff delete by owner" ON public.staff;
CREATE POLICY "Staff delete by owner" ON public.staff
  FOR DELETE
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

-- 5. Fix para product_extras (Issue #6 de la Fase 2, incluido aquí)
DROP POLICY IF EXISTS "Product extras insert by owner" ON public.product_extras;
CREATE POLICY "Product extras insert by owner" ON public.product_extras
  FOR ALL
  USING (
    product_id IN (
      SELECT p.id FROM public.products p
      JOIN public.businesses b ON p.business_id = b.id
      WHERE b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    product_id IN (
      SELECT p.id FROM public.products p
      JOIN public.businesses b ON p.business_id = b.id
      WHERE b.owner_id = auth.uid()
    )
  );

-- 6. Asegurar que settings sea accesible por owner
DROP POLICY IF EXISTS "Settings access by owner" ON public.settings;
CREATE POLICY "Settings access by owner" ON public.settings
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
  );

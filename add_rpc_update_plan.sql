-- ============================================================
-- RPC PARA ACTUALIZAR EL TIPO DE PLAN (SYSTEM_MODE)
-- ============================================================
-- Esta función permite al SuperAdmin actualizar el plan de un negocio
-- ignorando las políticas RLS (porque usa SECURITY DEFINER).

CREATE OR REPLACE FUNCTION update_business_plan(
  p_business_id UUID,
  p_business_name TEXT,
  p_slug TEXT,
  p_system_mode TEXT
)
RETURNS VOID AS $$
BEGIN
  -- 1. Actualizar tabla businesses (nombre y slug)
  UPDATE businesses 
  SET business_name = p_business_name, 
      slug = p_slug 
  WHERE id = p_business_id;

  -- 2. Actualizar tabla settings (system_mode)
  UPDATE settings 
  SET system_mode = p_system_mode 
  WHERE business_id = p_business_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

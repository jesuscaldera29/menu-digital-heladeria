-- ============================================================
-- ACTUALIZACIÓN: AGREGAR FOTO DEL DESARROLLADOR A LA LANDING
-- Ejecuta esto en Supabase SQL Editor
-- ============================================================

ALTER TABLE landing_settings 
ADD COLUMN IF NOT EXISTS developer_image_url TEXT DEFAULT 'https://ui-avatars.com/api/?name=Dev&background=ff5f6d&color=fff&size=200';

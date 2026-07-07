-- Ejecuta esto en el Editor SQL de Supabase para añadir todas las columnas necesarias a landing_settings
ALTER TABLE landing_settings
ADD COLUMN IF NOT EXISTS price_old TEXT DEFAULT '150',
ADD COLUMN IF NOT EXISTS price_current TEXT DEFAULT '49',
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '573015027933',
ADD COLUMN IF NOT EXISTS spots_left INTEGER DEFAULT 3;

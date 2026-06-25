-- ============================================================
-- MIGRACIÓN: RELOJ CHECADOR Y PREVENCIÓN DE FRAUDE
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Añadir PIN a los empleados para acceso rápido en el reloj
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin VARCHAR(10);

-- Crear índice para búsquedas rápidas por PIN en la autenticación del reloj
CREATE INDEX IF NOT EXISTS idx_staff_pin ON staff(pin);

-- 2. Añadir campos para evidencias fotográficas en los turnos
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS photo_in_url TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS photo_out_url TEXT;

-- 3. Crear el bucket de almacenamiento para las fotos de los turnos
-- Nota: Esto debe ejecutarse si el bucket no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('shift_photos', 'shift_photos', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Políticas de Storage para 'shift_photos'
-- Permitir a cualquier usuario autenticado (o anónimo si el reloj está abierto) subir fotos
-- Como es un Kiosko/Reloj público, permitiremos INSERT público temporalmente, 
-- pero limitado al bucket 'shift_photos'.
CREATE POLICY "Permitir subida pública de fotos de turnos" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'shift_photos' );

-- Permitir lectura pública de las fotos para verlas en el admin
CREATE POLICY "Permitir lectura pública de fotos de turnos" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'shift_photos' );

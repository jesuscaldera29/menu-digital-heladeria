-- 1. Crear el bucket 'images' si no existe y hacerlo público
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Nota: Se ha eliminado la línea de ALTER TABLE porque Supabase ya lo trae activado por defecto y causaba error de permisos.

-- 2. Política para permitir a cualquier persona ver las imágenes (Acceso Público)
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'images' );

-- 3. Política para permitir a usuarios autenticados subir imágenes
CREATE POLICY "Auth Upload" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'images' AND auth.role() = 'authenticated' );

-- 4. Política para permitir a usuarios autenticados actualizar imágenes
CREATE POLICY "Auth Update" 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'images' AND auth.role() = 'authenticated' );

-- 5. Política para permitir a usuarios autenticados borrar imágenes
CREATE POLICY "Auth Delete" 
ON storage.objects FOR DELETE 
USING ( bucket_id = 'images' AND auth.role() = 'authenticated' );

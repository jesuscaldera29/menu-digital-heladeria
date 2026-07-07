-- Añadir campos para datos bancarios (Nequi y Transferencia Bancaria) a la tabla settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS nequi_info TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS bank_info TEXT DEFAULT '';

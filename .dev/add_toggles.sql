-- SCRIPT PARA AGREGAR OPCIONES DE MENÚ DIGITAL AL NEGOCIO

ALTER TABLE settings ADD COLUMN IF NOT EXISTS enable_card_payment BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS enable_coupons BOOLEAN DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS enable_tips BOOLEAN DEFAULT TRUE;

-- En caso de requerirlo, forzamos los valores a true por si quedaron como nulls:
UPDATE settings SET enable_card_payment = TRUE WHERE enable_card_payment IS NULL;
UPDATE settings SET enable_coupons = TRUE WHERE enable_coupons IS NULL;
UPDATE settings SET enable_tips = TRUE WHERE enable_tips IS NULL;

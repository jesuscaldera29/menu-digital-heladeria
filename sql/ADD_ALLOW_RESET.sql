ALTER TABLE businesses ADD COLUMN IF NOT EXISTS allow_reset_data BOOLEAN DEFAULT false;

-- Update the superadmin view to include the new column
CREATE OR REPLACE VIEW superadmin_businesses_view AS
SELECT 
    b.id,
    b.business_name,
    b.slug,
    b.owner_id,
    b.created_at,
    b.is_active,
    b.allow_reset_data,
    s.whatsapp,
    s.admin_email,
    s.admin_password,
    s.admin_phone,
    (SELECT count(*) FROM products p WHERE p.business_id = b.id) as products_count,
    (SELECT count(*) FROM orders o WHERE o.business_id = b.id) as orders_count
FROM businesses b
LEFT JOIN settings s ON b.id = s.business_id;

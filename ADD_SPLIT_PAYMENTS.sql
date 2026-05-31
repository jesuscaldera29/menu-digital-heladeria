-- Run this in your Supabase SQL Editor
ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_payments JSONB DEFAULT '{}'::jsonb;

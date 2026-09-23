-- ==============================================================================
-- 12. Sınıf ve Diğer Sınıflar İçin Danışmanlık Rolü Migration
-- ==============================================================================
-- Bu komutu Supabase Dashboard > SQL Editor alanında bir defa çalıştırabilirsiniz.
-- (Çalıştırılmasa dahi sistem tarayıcı hafızasıyla otomatik olarak uyumlu çalışır.)

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS is_counselor BOOLEAN DEFAULT false;

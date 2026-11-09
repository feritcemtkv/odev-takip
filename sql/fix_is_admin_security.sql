-- ==============================================================================
-- GÜVENLİK YAMASI: YÖNETİCİ (ADMIN) YETKİ YÜKSELTME AÇIĞINI KAPAT
-- ==============================================================================
-- Bu SQL kodunu Supabase Dashboard > SQL Editor alanında 1 KEZ ÇALIŞTIRIN.
--
-- SORUN:
--   Önceki is_admin() fonksiyonu kullanıcının "user_metadata" alanına da
--   bakıyordu. Bu alanı her kullanıcı kendi oturumundan değiştirebilir; yani
--   giriş yapabilen herhangi bir öğretmen kendini yönetici yapıp tüm sınıfların
--   verilerini okuyabilir ve değiştirebilirdi.
--
-- ÇÖZÜM:
--   Yönetici yalnızca şu iki yoldan tanınır (ikisi de kullanıcı tarafından
--   değiştirilemez):
--     1. E-postası admin@takip.local olan hesap
--     2. app_metadata.role = 'admin' olan hesap (yalnızca Supabase panelinden
--        veya sunucu tarafından atanabilir)
--   Hiçbir veri silinmez; yalnızca fonksiyon değiştirilir.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND (
        lower(email) = 'admin@takip.local'
        OR coalesce(raw_app_meta_data->>'role', '') = 'admin'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Yönetici hesabının app_metadata rolünün tanımlı olduğundan emin ol
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
WHERE lower(email) = 'admin@takip.local';

-- ------------------------------------------------------------------------------
-- KONTROL: Açığı kullanmış olabilecek hesaplar
-- Aşağıdaki sorgu, yönetici olmadığı halde kendine "admin" rolü yazmış
-- hesapları listeler. Sonuç boşsa ("No rows returned") sorun yok demektir.
-- ------------------------------------------------------------------------------
SELECT email, raw_user_meta_data->>'role' AS user_metadata_role, created_at, last_sign_in_at
FROM auth.users
WHERE coalesce(raw_user_meta_data->>'role', '') = 'admin'
  AND lower(email) <> 'admin@takip.local';

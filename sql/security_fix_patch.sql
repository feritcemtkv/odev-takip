-- ==============================================================================
-- ACİL GÜVENLİK YAMASI (SUPABASE SQL EDITOR'DA 1 KEZ ÇALIŞTIRIN)
-- ==============================================================================
-- 1. YETKİ YÜKSELTME ZAFİYETİ DÜZELTMESİ:
--    Kullanıcının kendi user_metadata'sını değiştirerek admin olmasını engeller.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (coalesce(auth.jwt() ->> 'email', '') = 'admin@takip.local')
      OR (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
$$;

-- ------------------------------------------------------------------------------
-- 2. YETKİSİZ KULLANICI OLUŞTURMA VE RPC BYPASS DÜZELTMESİ:
--    create_user_admin fonksiyonunun anonim erişimini iptal eder ve
--    içine adminlik zorunluluğu ekler.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_admin(new_username text, new_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    clean_user text;
    user_email text;
    new_user_id uuid;
    encrypted_pw text;
BEGIN
    -- Güvenlik Kontrolü: Bu fonksiyonu yalnızca yönetici (admin) çağırabilir!
    IF NOT public.is_admin() THEN
        RETURN json_build_object('success', false, 'message', 'Yetkisiz erişim: Bu işlemi yalnızca yönetici (admin) yapabilir.');
    END IF;

    clean_user := trim(new_username);
    IF clean_user = '' THEN
        RETURN json_build_object('success', false, 'message', 'Kullanıcı adı boş olamaz.');
    END IF;

    IF length(new_password) < 6 THEN
        RETURN json_build_object('success', false, 'message', 'Şifre en az 6 karakter olmalıdır.');
    END IF;

    IF clean_user LIKE '%@%' THEN
        user_email := clean_user;
    ELSE
        user_email := clean_user || '@takip.local';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
        RETURN json_build_object('success', false, 'message', 'Bu kullanıcı adı zaten kayıtlı.');
    END IF;

    new_user_id := gen_random_uuid();
    encrypted_pw := crypt(new_password, gen_salt('bf'));

    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        '00000000-0000-0000-0000-000000000000',
        user_email,
        encrypted_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', clean_user),
        'authenticated',
        'authenticated',
        now(),
        now()
    );

    INSERT INTO auth.identities (
        id,
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        new_user_id::text,
        new_user_id,
        jsonb_build_object('sub', new_user_id::text, 'email', user_email),
        'email',
        now(),
        now(),
        now()
    );

    RETURN json_build_object('success', true, 'message', 'Kullanıcı başarıyla oluşturuldu.', 'user_id', new_user_id);
END;
$$;

-- Anonim ve genel yetkileri iptal et, sadece giriş yapmış kullanıcılar (admin denetimiyle) çağırabilsin
REVOKE EXECUTE ON FUNCTION public.create_user_admin(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_user_admin(text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. ADMIN HESABININ app_metadata ROLÜNÜ GÜNCELLE
-- ------------------------------------------------------------------------------
UPDATE auth.users
SET raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'admin'),
    updated_at = now()
WHERE email = 'admin@takip.local';

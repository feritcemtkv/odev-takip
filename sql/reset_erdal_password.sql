-- ==============================================================================
-- ERDAL KULLANICISI ŞİFRE SIFIRLAMA (123456)
-- ==============================================================================
-- Bu SQL kodunu Supabase Dashboard > SQL Editor alanında 1 kez çalıştırın:
-- https://supabase.com/dashboard/project/miekldpkuclbinclnvvu/sql/new

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Erdal kullanıcısının şifresini '123456' olarak günceller:
UPDATE auth.users
SET encrypted_password = crypt('123456', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'erdal@takip.local';

-- 2. Gelecekte yöneticinin (Admin) uygulama içinden istediği öğretmenin şifresini
--    tek tıkla sıfırlayabilmesi için güvenli Admin RPC fonksiyonu:
CREATE OR REPLACE FUNCTION public.reset_user_password_admin(p_username text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_email text;
    v_encrypted_pw text;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN json_build_object('success', false, 'message', 'Yetkisiz erişim: Bu işlemi yalnızca yönetici yapabilir.');
    END IF;

    p_username := trim(lower(p_username));
    IF p_username = '' THEN
        RETURN json_build_object('success', false, 'message', 'Kullanıcı adı boş olamaz.');
    END IF;

    IF length(p_password) < 6 THEN
        RETURN json_build_object('success', false, 'message', 'Şifre en az 6 karakter olmalıdır.');
    END IF;

    IF p_username LIKE '%@%' THEN
        v_email := p_username;
    ELSE
        v_email := p_username || '@takip.local';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
        RETURN json_build_object('success', false, 'message', 'Kullanıcı bulunamadı: ' || v_email);
    END IF;

    v_encrypted_pw := crypt(p_password, gen_salt('bf'));

    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = now()
    WHERE email = v_email;

    RETURN json_build_object('success', true, 'message', 'Şifre başarıyla güncellendi: ' || p_username);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_user_password_admin(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reset_user_password_admin(text, text) TO authenticated;
